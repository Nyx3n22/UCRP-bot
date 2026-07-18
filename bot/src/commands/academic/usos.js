/**
 * commands/academic/usos.js
 * /indeks — student sprawdza własne oceny i GPA.
 * /usos ocen [uzytkownik] [przedmiot] [ocena] — kadra wystawia ocenę.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("usos")
    .setDescription("System USOS")
    .addSubcommand((s) =>
      s
        .setName("ocen")
        .setDescription("Wystawia ocenę studentowi (kadra)")
        .addUserOption((o) => o.setName("uzytkownik").setDescription("Student").setRequired(true))
        .addStringOption((o) => o.setName("przedmiot").setDescription("Nazwa przedmiotu").setRequired(true))
        .addNumberOption((o) => o.setName("ocena").setDescription("Skala 2.0 - 5.0").setRequired(true))
    )
    .addSubcommand((s) => s.setName("indeks").setDescription("Wyświetla Twój indeks (oceny + GPA)")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "ocen") return this._issueGrade(interaction);
    if (sub === "indeks") return this._showIndex(interaction);
  },

  async _issueGrade(interaction) {
    if (!(await hasPermission(interaction.member, "MANAGE_GRADES"))) {
      return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
    }

    const user = interaction.options.getUser("uzytkownik");
    const subjectName = interaction.options.getString("przedmiot");
    const value = interaction.options.getNumber("ocena");

    if (value < 2 || value > 5) {
      return interaction.reply({ content: "Ocena musi być w skali 2.0 - 5.0.", ephemeral: true });
    }

    const subject = await prisma.subject.findFirst({ where: { name: subjectName } });
    if (!subject) return interaction.reply({ content: `Nie znaleziono przedmiotu "${subjectName}".`, ephemeral: true });

    await prisma.grade.create({
      data: { userId: user.id, subjectId: subject.id, value, issuedById: interaction.user.id },
    });

    return interaction.reply(`✅ Wystawiono ocenę **${value}** z **${subject.name}** dla <@${user.id}>.`);
  },

  async _showIndex(interaction) {
    const grades = await prisma.grade.findMany({
      where: { userId: interaction.user.id },
      include: { subject: true },
      orderBy: { createdAt: "desc" },
    });

    if (grades.length === 0) {
      return interaction.reply({ content: "Nie masz jeszcze żadnych wystawionych ocen.", ephemeral: true });
    }

    const gpa = grades.reduce((sum, g) => sum + g.value, 0) / grades.length;

    const embed = new EmbedBuilder()
      .setTitle("📖 Twój indeks")
      .setDescription(
        grades.map((g) => `**${g.subject.name}** — ${g.value.toFixed(1)}`).join("\n")
      )
      .addFields({ name: "Średnia (GPA)", value: gpa.toFixed(2), inline: true })
      .setColor(0x8a1538);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
