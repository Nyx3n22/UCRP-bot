/**
 * verificationService.js
 *
 * Pełny flow weryfikacji, WŁASNA implementacja (bez RoVer/Bloxlink):
 *  1) Przycisk -> Modal: Imię IC, Nazwisko IC, Data urodzenia IC, nazwa użytkownika Roblox
 *  2) Bot sprawdza czy taki użytkownik Roblox istnieje (publiczne API)
 *  3) Captcha: TYLKO obrazek (kod nigdzie nie jest napisany tekstem) + przycisk
 *     "Wpisz kod" -> otwiera Modal z jednym polem
 *  4) Po poprawnym wpisaniu captchy: bot generuje unikalny kod i prosi o wklejenie
 *     go w opisie profilu Roblox, z przyciskiem "Sprawdź teraz"
 *  5) Bot odczytuje opis profilu przez publiczne Roblox API, jeśli kod się zgadza
 *     -> zapisuje Character (z PESEL) i nadaje rolę VERIFIED_ROLE
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const { generatePesel } = require("./peselGenerator");
const { generateCaptcha } = require("../utils/captcha");
const robloxClient = require("./robloxClient");
const { getRoleIdForPermission } = require("../config/roles");

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  return out;
}

class VerificationService {
  constructor() {
    this._pendingVerifications = new Map(); // discordUserId -> stan weryfikacji
  }

  buildModal() {
    const modal = new ModalBuilder().setCustomId("verify_modal").setTitle("Weryfikacja IC");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("firstNameIC").setLabel("Imię IC").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("lastNameIC").setLabel("Nazwisko IC").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("birthDateIC")
          .setLabel("Data urodzenia IC (DD.MM.RRRR)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("np. 14.03.2001")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("robloxUsername")
          .setLabel("Nazwa użytkownika Roblox")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    return modal;
  }

  /** Krok 1: submit modala z danymi IC + nazwą Roblox -> generuje captchę */
  async handleModalSubmit(interaction) {
    const firstNameIC = interaction.fields.getTextInputValue("firstNameIC").trim();
    const lastNameIC = interaction.fields.getTextInputValue("lastNameIC").trim();
    const rawDate = interaction.fields.getTextInputValue("birthDateIC").trim();
    const robloxUsername = interaction.fields.getTextInputValue("robloxUsername").trim();

    const birthDate = this._parseDate(rawDate);
    if (!birthDate) {
      return interaction.reply({ content: "❌ Nieprawidłowy format daty. Użyj DD.MM.RRRR.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const robloxUser = await robloxClient.getUserIdByUsername(robloxUsername);
    if (!robloxUser) {
      return interaction.editReply(
        `❌ Nie znaleziono użytkownika Roblox o nazwie "${robloxUsername}". Sprawdź pisownię i spróbuj weryfikacji od nowa.`
      );
    }

    const captcha = generateCaptcha();

    this._pendingVerifications.set(interaction.user.id, {
      firstNameIC,
      lastNameIC,
      birthDate,
      robloxUserId: robloxUser.id,
      robloxUsername: robloxUser.name,
      captchaCode: captcha.code,
      captchaVerified: false,
      verificationCode: null,
      createdAt: Date.now(),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("verify_captcha_button").setLabel("Wpisz kod z obrazka").setStyle(ButtonStyle.Primary)
    );

    // UWAGA: kod celowo NIE jest nigdzie w tekście - tylko na obrazku, inaczej captcha nie miałaby sensu
    await interaction.editReply({
      content: "Przepisz kod z obrazka poniżej, klikając przycisk.",
      files: [captcha.attachment],
      components: [row],
    });
  }

  /** Krok 2: przycisk pod obrazkiem captchy -> otwiera Modal z jednym polem na kod */
  buildCaptchaModal() {
    return new ModalBuilder()
      .setCustomId("verify_captcha_modal")
      .setTitle("Wpisz kod z obrazka")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("kod").setLabel("Kod z obrazka").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
  }

  /** Krok 3: submit Modala z kodem captchy */
  async handleCaptchaModalSubmit(interaction) {
    const pending = this._pendingVerifications.get(interaction.user.id);
    if (!pending) {
      return interaction.reply({ content: "Brak aktywnej weryfikacji. Zacznij od nowa.", ephemeral: true });
    }
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
      this._pendingVerifications.delete(interaction.user.id);
      return interaction.reply({ content: "Sesja weryfikacji wygasła. Zacznij od nowa.", ephemeral: true });
    }

    const kod = interaction.fields.getTextInputValue("kod").trim().toUpperCase();
    if (kod !== pending.captchaCode) {
      return interaction.reply({ content: "❌ Błędny kod z obrazka. Spróbuj ponownie (przycisk nadal działa).", ephemeral: true });
    }

    pending.captchaVerified = true;
    pending.verificationCode = randomCode();

    const embed = new EmbedBuilder()
      .setTitle("Ostatni krok — potwierdź konto Roblox")
      .setDescription(
        `1. Wejdź na swój profil Roblox (**${pending.robloxUsername}**) → Edytuj profil → Opis (About)\n` +
          `2. Wklej dokładnie ten kod gdziekolwiek w opisie:\n\n\`\`\`${pending.verificationCode}\`\`\`\n` +
          `3. Zapisz zmiany na Roblox\n` +
          `4. Wróć tutaj i kliknij przycisk "Sprawdź teraz"\n\n` +
          `Kod możesz usunąć z opisu zaraz po udanej weryfikacji.`
      )
      .setColor(0x1a2a6c);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("verify_roblox_check_button").setLabel("Sprawdź teraz").setStyle(ButtonStyle.Success)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  /** Krok 4: przycisk "Sprawdź teraz" -> odczytuje opis profilu Roblox i finalizuje weryfikację */
  async handleRobloxCheckButton(interaction) {
    const pending = this._pendingVerifications.get(interaction.user.id);
    if (!pending || !pending.captchaVerified) {
      return interaction.reply({ content: "Brak aktywnej weryfikacji na tym etapie. Zacznij od nowa.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const description = await robloxClient.getUserDescription(pending.robloxUserId);
    if (description === null) {
      return interaction.editReply("❌ Nie udało się pobrać profilu Roblox (spróbuj ponownie za chwilę).");
    }

    if (!description.includes(pending.verificationCode)) {
      return interaction.editReply(
        "❌ Nie znaleziono kodu w opisie profilu. Upewnij się, że zapisałeś zmiany na Roblox, poczekaj chwilę (Roblox czasem potrzebuje minuty na aktualizację) i kliknij przycisk ponownie."
      );
    }

    // Sukces - zapis do bazy + nadanie roli
    const genderIC = this._inferGenderFromName(pending.firstNameIC);
    const pesel = generatePesel(pending.birthDate, genderIC);

    await prisma.discordUser.upsert({
      where: { id: interaction.user.id },
      update: { robloxId: String(pending.robloxUserId), robloxUsername: pending.robloxUsername, verifiedAt: new Date() },
      create: {
        id: interaction.user.id,
        robloxId: String(pending.robloxUserId),
        robloxUsername: pending.robloxUsername,
        verifiedAt: new Date(),
      },
    });

    await prisma.character.create({
      data: {
        userId: interaction.user.id,
        firstNameIC: pending.firstNameIC,
        lastNameIC: pending.lastNameIC,
        birthDateIC: pending.birthDate,
        genderIC,
        pesel,
      },
    });

    const verifiedRoleId = await getRoleIdForPermission("VERIFIED_ROLE");
    if (verifiedRoleId) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      await member?.roles.add(verifiedRoleId).catch(() => null);
    }

    this._pendingVerifications.delete(interaction.user.id);

    return interaction.editReply(
      `✅ Weryfikacja zakończona! Witaj, **${pending.firstNameIC} ${pending.lastNameIC}**. Możesz teraz usunąć kod z opisu profilu Roblox.`
    );
  }

  _parseDate(raw) {
    const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  _inferGenderFromName(firstName) {
    return firstName.toLowerCase().endsWith("a") ? "FEMALE" : "MALE";
  }
}

module.exports = new VerificationService();
