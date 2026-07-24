/**
 * commands/academic/usos.js
 *
 * JEDNA komenda, ZERO podkomend: /usos - bez żadnych argumentów.
 * Bot sam rozpoznaje rolę wywołującego i pokazuje dopasowany panel:
 *  - Student: własne oceny, GPA, frekwencja + przycisk "Napisz do wykładowcy"
 *  - Wykładowca (MANAGE_GRADES): przyciski "Wystaw ocenę" i "Wpisz frekwencję"
 *  - Władze uczelni (RECTORATE_ACCESS lub MANAGE_DEANERY): to co wykładowca
 *    + "Zatrudnij", "Zwolnij", "Wygeneruj raport" (audyt całej uczelni)
 *
 * Wszystkie akcje (wystawienie oceny, wpis frekwencji, zatrudnienie,
 * zwolnienie, wiadomość do wykładowcy) dzieją się przez przyciski -> Modal,
 * obsługiwane w events/interactionCreate.js pod prefiksem "usos_panel:".
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require("discord.js");
const prisma = require("../../lib/prisma");
const { hasPermission, getRoleIdForPermission } = require("../../config/roles");

function parseUserId(raw) {
  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  return mentionMatch ? mentionMatch[1] : raw.trim();
}

async function resolveTier(member) {
  const isElevated =
    (await hasPermission(member, "RECTORATE_ACCESS")) || (await hasPermission(member, "MANAGE_DEANERY"));
  if (isElevated) return "elevated";
  if (await hasPermission(member, "MANAGE_GRADES")) return "lecturer";
  return "student";
}

module.exports = {
  data: new SlashCommandBuilder().setName("usos").setDescription("Otwiera panel USOS dopasowany do Twojej roli"),

  async execute(interaction) {
    // Neon (darmowy plan) usypia bazę przy bezczynności - jej "obudzenie" bywa
    // wolniejsze niż 3-sekundowy limit Discorda na pierwszą odpowiedź. Odkładamy
    // odpowiedź natychmiast, żeby zyskać do 15 minut zamiast 3 sekund.
    await interaction.deferReply({ ephemeral: true });

    const tier = await resolveTier(interaction.member);

    if (tier === "student") return this._studentPanel(interaction);
    return this._staffPanel(interaction, tier); // "lecturer" lub "elevated"
  },

  async _studentPanel(interaction) {
    const [grades, attendance] = await Promise.all([
      prisma.grade.findMany({ where: { userId: interaction.user.id }, include: { subject: true }, orderBy: { createdAt: "desc" } }),
      prisma.attendanceEntry.findMany({ where: { studentId: interaction.user.id } }),
    ]);

    const embed = new EmbedBuilder().setTitle("📖 USOS — Panel studenta").setColor(0x8a1538);

    if (grades.length > 0) {
      const gpa = grades.reduce((sum, g) => sum + g.value, 0) / grades.length;
      embed.addFields(
        { name: "Oceny", value: grades.map((g) => `**${g.subject.name}** — ${g.value.toFixed(1)}`).join("\n").slice(0, 1024) },
        { name: "Średnia (GPA)", value: gpa.toFixed(2), inline: true }
      );
    } else {
      embed.addFields({ name: "Oceny", value: "Brak jeszcze wystawionych ocen." });
    }

    if (attendance.length > 0) {
      const presentCount = attendance.filter((a) => a.present).length;
      const percent = Math.round((presentCount / attendance.length) * 100);
      const totalActivity = attendance.reduce((sum, a) => sum + a.activityPoints, 0);
      embed.addFields(
        { name: "Frekwencja", value: `${percent}% (${presentCount}/${attendance.length})`, inline: true },
        { name: "Aktywność", value: `${totalActivity} pkt`, inline: true }
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("usos_panel:napisz").setLabel("Napisz do wykładowcy").setStyle(ButtonStyle.Primary)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  },

  async _staffPanel(interaction, tier) {
    const embed = new EmbedBuilder()
      .setTitle(tier === "elevated" ? "🏛️ USOS — Panel władz uczelni" : "📚 USOS — Panel wykładowcy")
      .setDescription("Wybierz akcję poniżej.")
      .setColor(0x1a2a6c);

    const buttons = [
      new ButtonBuilder().setCustomId("usos_panel:wystaw_ocene").setLabel("Wystaw ocenę").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("usos_panel:wpisz_frekwencje").setLabel("Wpisz frekwencję").setStyle(ButtonStyle.Primary),
    ];

    if (tier === "elevated") {
      buttons.push(
        new ButtonBuilder().setCustomId("usos_panel:zatrudnij").setLabel("Zatrudnij").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("usos_panel:zwolnij").setLabel("Zwolnij").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("usos_panel:raport").setLabel("Wygeneruj raport").setStyle(ButtonStyle.Secondary)
      );
    }

    // Discord pozwala max 5 przycisków w rzędzie
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    return interaction.editReply({ embeds: [embed], components: rows });
  },

  // ---------- Modale otwierane z przycisków (wywoływane z interactionCreate.js) ----------

  buildGradeModal() {
    return new ModalBuilder()
      .setCustomId("usos_grade_modal")
      .setTitle("Wystaw ocenę")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("student").setLabel("Student (@wzmianka lub ID)").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("przedmiot").setLabel("Przedmiot").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("ocena").setLabel("Ocena (2.0 - 5.0)").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
  },

  buildAttendanceModal() {
    return new ModalBuilder()
      .setCustomId("usos_attendance_modal")
      .setTitle("Wpisz frekwencję")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("student").setLabel("Student (@wzmianka lub ID)").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("przedmiot").setLabel("Przedmiot").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("obecny").setLabel("Obecny? (tak/nie)").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("aktywnosc").setLabel("Punkty aktywności (liczba, domyślnie 0)").setStyle(TextInputStyle.Short).setRequired(false)
        )
      );
  },

  buildHireFireModal(mode) {
    return new ModalBuilder()
      .setCustomId(`usos_${mode}_modal`)
      .setTitle(mode === "hire" ? "Zatrudnij" : "Zwolnij")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("uzytkownik").setLabel("Użytkownik (@wzmianka lub ID)").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("stanowisko")
            .setLabel("Stanowisko: wykladowca / administracja / student")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
  },

  /** Krok 1 "Napisz do wykładowcy": lista wyboru użytkownika zamiast ręcznego wpisywania ID */
  buildLecturerSelectRow() {
    return new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("usos_select_lecturer")
        .setPlaceholder("Wybierz wykładowcę, do którego piszesz")
        .setMinValues(1)
        .setMaxValues(1)
    );
  },

  /** Krok 2: po wyborze osoby - modal tylko na treść wiadomości, ID odbiorcy w customId */
  buildWriteModal(lecturerId) {
    return new ModalBuilder()
      .setCustomId(`usos_write_modal:${lecturerId}`)
      .setTitle("Napisz do wykładowcy")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("tresc").setLabel("Treść wiadomości").setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      );
  },

  // ---------- Obsługa submitów modali ----------

  async handleGradeModalSubmit(interaction) {
    const studentId = parseUserId(interaction.fields.getTextInputValue("student"));
    const przedmiotNazwa = interaction.fields.getTextInputValue("przedmiot");
    const value = Number(interaction.fields.getTextInputValue("ocena").replace(",", "."));

    if (!studentId || Number.isNaN(value) || value < 2 || value > 5) {
      return interaction.reply({ content: "❌ Nieprawidłowe dane (sprawdź ID studenta i ocenę 2.0-5.0).", ephemeral: true });
    }

    const subject = await prisma.subject.findFirst({ where: { name: przedmiotNazwa } });
    if (!subject) return interaction.reply({ content: `Nie znaleziono przedmiotu "${przedmiotNazwa}".`, ephemeral: true });

    const student = await interaction.client.users.fetch(studentId).catch(() => null);
    if (!student) return interaction.reply({ content: "Nie znaleziono takiego użytkownika.", ephemeral: true });

    await prisma.grade.create({ data: { userId: student.id, subjectId: subject.id, value, issuedById: interaction.user.id } });
    await interaction.reply(`✅ Wystawiono ocenę **${value}** z **${subject.name}** dla <@${student.id}>.`);
    await student.send(`📖 Otrzymałeś/aś ocenę **${value}** z przedmiotu **${subject.name}**.`).catch(() => null);
  },

  async handleAttendanceModalSubmit(interaction) {
    const studentId = parseUserId(interaction.fields.getTextInputValue("student"));
    const przedmiotNazwa = interaction.fields.getTextInputValue("przedmiot");
    const obecnyRaw = interaction.fields.getTextInputValue("obecny").trim().toLowerCase();
    const aktywnoscRaw = interaction.fields.getTextInputValue("aktywnosc");
    const aktywnosc = aktywnoscRaw ? parseInt(aktywnoscRaw, 10) || 0 : 0;
    const present = ["tak", "t", "yes", "y", "1"].includes(obecnyRaw);

    const subject = await prisma.subject.findFirst({ where: { name: przedmiotNazwa } });
    if (!subject) return interaction.reply({ content: `Nie znaleziono przedmiotu "${przedmiotNazwa}".`, ephemeral: true });

    const student = await interaction.client.users.fetch(studentId).catch(() => null);
    if (!student) return interaction.reply({ content: "Nie znaleziono takiego użytkownika.", ephemeral: true });

    await prisma.attendanceEntry.create({
      data: { subjectId: subject.id, studentId: student.id, lecturerId: interaction.user.id, present, activityPoints: aktywnosc },
    });

    return interaction.reply(
      `📋 Wpisano: <@${student.id}> — **${subject.name}** — ${present ? "obecny/a ✅" : "nieobecny/a ❌"}${aktywnosc ? ` (+${aktywnosc} pkt)` : ""}`
    );
  },

  async handleHireFireModalSubmit(interaction, mode) {
    const targetId = parseUserId(interaction.fields.getTextInputValue("uzytkownik"));
    const stanowisko = interaction.fields.getTextInputValue("stanowisko").trim().toLowerCase();

    const permissionKeyMap = { wykladowca: "WYKLADOWCA_ROLE", administracja: "ADMINISTRACJA_ROLE", student: "STUDENT_ROLE" };
    const permissionKey = permissionKeyMap[stanowisko];
    if (!permissionKey) {
      return interaction.reply({ content: "❌ Stanowisko musi być jednym z: wykladowca, administracja, student.", ephemeral: true });
    }

    const roleId = await getRoleIdForPermission(permissionKey);
    if (!roleId) {
      return interaction.reply({ content: `❌ Rola dla "${stanowisko}" nie jest skonfigurowana w Dashboardzie (zakładka Role).`, ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) return interaction.reply({ content: "Nie znaleziono takiego użytkownika na serwerze.", ephemeral: true });

    try {
      await member.roles[mode === "hire" ? "add" : "remove"](roleId);
    } catch (err) {
      return interaction.reply({
        content: "❌ Nie udało się zmienić roli — sprawdź czy rola bota jest wyżej w hierarchii niż rola docelowa.",
        ephemeral: true,
      });
    }

    await prisma.actionLog.create({
      data: { actorId: interaction.user.id, action: mode === "hire" ? "USOS_ZATRUDNIENIE" : "USOS_ZWOLNIENIE", targetId, metadata: { stanowisko } },
    });

    return interaction.reply(
      mode === "hire"
        ? `✅ Zatrudniono <@${targetId}> na stanowisku: **${stanowisko}**.`
        : `✅ Zwolniono <@${targetId}> ze stanowiska: **${stanowisko}**.`
    );
  },

  async handleWriteModalSubmit(interaction, lecturerId) {
    await interaction.deferReply({ ephemeral: true });

    const tresc = interaction.fields.getTextInputValue("tresc");
    const wykladowca = await interaction.client.users.fetch(lecturerId).catch(() => null);
    if (!wykladowca) return interaction.editReply("Nie znaleziono takiego użytkownika.");

    const dm = await wykladowca
      .send(`📩 **Wiadomość od studenta** <@${interaction.user.id}> (${interaction.user.tag}):\n\n${tresc}`)
      .catch(() => null);

    if (!dm) {
      return interaction.editReply("❌ Nie udało się wysłać — wykładowca może mieć zablokowane DM.");
    }
    return interaction.editReply(`✅ Wiadomość wysłana do <@${lecturerId}>.`);
  },

  async handleReportButton(interaction) {
    const subjects = await prisma.subject.findMany({ include: { grades: true, attendanceEntries: true } });
    if (subjects.length === 0) return interaction.reply({ content: "Brak danych do raportu.", ephemeral: true });

    const allGrades = subjects.flatMap((s) => s.grades);
    const allAttendance = subjects.flatMap((s) => s.attendanceEntries);
    const avgGpa = allGrades.length > 0 ? allGrades.reduce((sum, g) => sum + g.value, 0) / allGrades.length : null;
    const presentPercent =
      allAttendance.length > 0
        ? Math.round((allAttendance.filter((a) => a.present).length / allAttendance.length) * 100)
        : null;

    const embed = new EmbedBuilder()
      .setTitle("🏛️ Raport akademicki — cała uczelnia")
      .addFields(
        { name: "Przedmioty", value: `${subjects.length}`, inline: true },
        { name: "Średnia ocen (GPA)", value: avgGpa !== null ? avgGpa.toFixed(2) : "brak danych", inline: true },
        { name: "Śr. frekwencja", value: presentPercent !== null ? `${presentPercent}%` : "brak danych", inline: true }
      )
      .setColor(0x1a2a6c);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
