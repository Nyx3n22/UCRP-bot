/**
 * verificationService.js
 *
 * Realizuje pkt. 3 specyfikacji:
 *  1) Przycisk na kanale weryfikacji -> otwiera Modal (Imię IC, Nazwisko IC, Data ur. IC)
 *  2) Captcha (prosty wygenerowany obrazek/kod, weryfikowany przyciskiem)
 *  3) Weryfikacja konta Roblox przez zewnętrzne API (Bloxlink/RoVer) lub własne
 *  4) Nadanie roli "Zweryfikowany" + zapis Character do bazy (z wygenerowanym PESEL)
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const { generatePesel } = require("./peselGenerator");
const { generateCaptcha } = require("../utils/captcha");

const ROBLOX_PROVIDER = process.env.ROBLOX_VERIFY_PROVIDER || "rover"; // "rover" | "bloxlink" | "custom"

class VerificationService {
  buildModal() {
    const modal = new ModalBuilder().setCustomId("verify_modal").setTitle("Weryfikacja IC");

    const firstName = new TextInputBuilder()
      .setCustomId("firstNameIC")
      .setLabel("Imię IC")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const lastName = new TextInputBuilder()
      .setCustomId("lastNameIC")
      .setLabel("Nazwisko IC")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const birthDate = new TextInputBuilder()
      .setCustomId("birthDateIC")
      .setLabel("Data urodzenia IC (DD.MM.RRRR)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("np. 14.03.2001")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(firstName),
      new ActionRowBuilder().addComponents(lastName),
      new ActionRowBuilder().addComponents(birthDate)
    );

    return modal;
  }

  /** Wywoływane po submit modala — zapisuje dane tymczasowe i wysyła captchę na DM/ephemeral */
  async handleModalSubmit(interaction) {
    const firstNameIC = interaction.fields.getTextInputValue("firstNameIC").trim();
    const lastNameIC = interaction.fields.getTextInputValue("lastNameIC").trim();
    const rawDate = interaction.fields.getTextInputValue("birthDateIC").trim();

    const birthDate = this._parseDate(rawDate);
    if (!birthDate) {
      return interaction.reply({
        content: "❌ Nieprawidłowy format daty. Użyj DD.MM.RRRR.",
        ephemeral: true,
      });
    }

    const captcha = generateCaptcha();

    // Trzymamy stan weryfikacji w pamięci procesu (Map) — do produkcji: Redis z TTL
    this._pendingVerifications = this._pendingVerifications || new Map();
    this._pendingVerifications.set(interaction.user.id, {
      firstNameIC,
      lastNameIC,
      birthDate,
      captchaCode: captcha.code,
      createdAt: Date.now(),
    });

    await interaction.reply({
      content: `Aby dokończyć weryfikację, przepisz poniższy kod: **${captcha.code}**\n(Odpowiedz komendą /captcha [kod] w ciągu 5 minut)`,
      files: [captcha.attachment],
      ephemeral: true,
    });
  }

  /** Wywoływane przy komendzie /captcha [kod] */
  async handleCaptchaSubmit(interaction, code) {
    const pending = this._pendingVerifications?.get(interaction.user.id);

    if (!pending) {
      return interaction.reply({ content: "Brak aktywnej weryfikacji. Zacznij od nowa.", ephemeral: true });
    }
    if (Date.now() - pending.createdAt > 5 * 60 * 1000) {
      this._pendingVerifications.delete(interaction.user.id);
      return interaction.reply({ content: "Kod wygasł. Zacznij weryfikację od nowa.", ephemeral: true });
    }
    if (code.trim().toUpperCase() !== pending.captchaCode) {
      return interaction.reply({ content: "❌ Błędny kod captcha.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // 3) Weryfikacja konta Roblox
    const robloxAccount = await this._verifyRobloxAccount(interaction.user.id);
    if (!robloxAccount) {
      return interaction.editReply(
        "❌ Nie udało się zweryfikować konta Roblox. Upewnij się, że masz połączone konto (np. przez RoVer/Bloxlink) i spróbuj ponownie."
      );
    }

    // 4) Zapis do bazy + nadanie roli
    const genderIC = this._inferGenderFromName(pending.firstNameIC);
    const pesel = generatePesel(pending.birthDate, genderIC);

    await prisma.discordUser.upsert({
      where: { id: interaction.user.id },
      update: { robloxId: robloxAccount.id, robloxUsername: robloxAccount.username, verifiedAt: new Date() },
      create: {
        id: interaction.user.id,
        robloxId: robloxAccount.id,
        robloxUsername: robloxAccount.username,
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

    const { getRoleIdForPermission } = require("../config/roles");
    const verifiedRoleId = await getRoleIdForPermission("VERIFIED_ROLE");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (verifiedRoleId) await member.roles.add(verifiedRoleId).catch(() => null);

    this._pendingVerifications.delete(interaction.user.id);

    await interaction.editReply(
      `✅ Weryfikacja zakończona! Witaj na Uniwersytecie Warszawskim RP, **${pending.firstNameIC} ${pending.lastNameIC}**.`
    );
  }

  async _verifyRobloxAccount(discordId) {
    if (ROBLOX_PROVIDER === "rover") {
      const res = await fetch(
        `https://verify.eryn.io/api/user/${discordId}?guildId=${process.env.GUILD_ID}`
      ).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json();
      return data.robloxId ? { id: data.robloxId, username: data.robloxUsername } : null;
    }

    if (ROBLOX_PROVIDER === "bloxlink") {
      const res = await fetch(
        `https://api.blox.link/v4/public/guilds/${process.env.GUILD_ID}/discord-to-roblox/${discordId}`,
        { headers: { Authorization: process.env.BLOXLINK_API_KEY } }
      ).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json();
      return data.robloxID ? { id: data.robloxID, username: data.resolved?.name } : null;
    }

    // provider "custom" - własne API zgodnie z osobną specyfikacją
    return null;
  }

  _parseDate(raw) {
    const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** Bardzo uproszczone wnioskowanie płci IC z końcówki imienia (do celów RP) */
  _inferGenderFromName(firstName) {
    return firstName.toLowerCase().endsWith("a") ? "FEMALE" : "MALE";
  }
}

module.exports = new VerificationService();
