/**
 * services/verificationServiceV2.js
 *
 * Ulepszony system weryfikacji z wstępną oceną AI i obowiązkowym przeglądem manualnym.
 * Przepływ:
 *  1) Modal: Imię/Nazwisko IC, Data urodzenia, nazwa Roblox
 *  2) Captcha: obrazek + Modal z kodem
 *  3) Weryfikacja profilu Roblox
 *  4) Analiza AI: ocena logiczności danych, detekcja anomalii
 *  5) Kolejka do przeglądu manualnego (moderator: Accept/Reject/MoreInfo)
 *  6) Po akceptacji: Character + role VERIFIED_ROLE
 *
 * Błędy logowane do ErrorLog.
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const { generatePesel } = require("./peselGenerator");
const { generateCaptcha } = require("../utils/captcha");
const robloxClient = require("./robloxClient");
const { getRoleIdForPermission, hasPermission } = require("../config/roles");
const { generateAiReply } = require("./aiGatewayService");
const { logError, logAction } = require("../utils/logger");

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return out;
}

class VerificationServiceV2 {
  constructor() {
    this._pendingVerifications = new Map(); // discordUserId -> stan weryfikacji
  }

  /**
   * Buduje modal z polami: Imię IC, Nazwisko IC, Data urodzenia, nazwa Roblox
   */
  buildModal() {
    const modal = new ModalBuilder().setCustomId("verify_modal_v2").setTitle("Weryfikacja IC — Krok 1/3");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("firstNameIC")
          .setLabel("Imię IC")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(50)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("lastNameIC")
          .setLabel("Nazwisko IC")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(50)
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
          .setMinLength(3)
          .setMaxLength(20)
      )
    );

    return modal;
  }

  /**
   * Krok 1: Submit modala — walidacja danych i generacja captchy
   */
  async handleModalSubmit(interaction) {
    // Potwierdzamy interakcję NATYCHMIAST, zanim zrobimy jakiekolwiek zapytania
    // do bazy. Discord daje tylko ~3s na ack — jeśli baza (Neon) właśnie
    // "budzi się" po bezczynności, te 3s łatwo przekroczyć, token wygasa,
    // i użytkownik dostaje generyczny błąd klienta Discorda zamiast naszego
    // komunikatu. Od teraz WSZYSTKO poniżej używa editReply, nigdy reply.
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (err) {
      // Jeśli nawet to się nie uda (naprawdę rzadkie), nic więcej nie zrobimy -
      // nie ma czego edytować.
      await logError("verificationService", "DEFER_FAILED", err.message, { userId: interaction.user.id, stack: err.stack }).catch(() => null);
      return;
    }

    try {
      // Bramka 1: czy już zweryfikowany?
      const existingCharacter = await prisma.character.findUnique({
        where: { userId: interaction.user.id },
      });
      if (existingCharacter) {
        return interaction.editReply({
          content: "❌ Masz już zweryfikowaną postać. Nie można weryfikować się ponownie.",
        });
      }

      // Bramka 2: czy nie ma już aktywnej próby weryfikacji?
      let existingAttempt = await prisma.verificationAttempt.findUnique({
        where: { userId: interaction.user.id },
      });

      // Jeśli próba istnieje, nie jest jeszcze oznaczona jako EXPIRED/REJECTED,
      // ale minęło już 24h (pole expiresAt) - wygasła "leniwie", w tym miejscu:
      // oznaczamy ją w bazie jako EXPIRED i pozwalamy zacząć od nowa, zamiast
      // blokować użytkownika w nieskończoność, gdyby moderator nigdy nie
      // zdążył jej rozpatrzyć.
      if (
        existingAttempt &&
        existingAttempt.status !== "EXPIRED" &&
        existingAttempt.status !== "REJECTED" &&
        existingAttempt.expiresAt &&
        existingAttempt.expiresAt.getTime() < Date.now()
      ) {
        await prisma.verificationAttempt.update({
          where: { userId: interaction.user.id },
          data: { status: "EXPIRED" },
        });
        existingAttempt = null;
      }

      if (existingAttempt && existingAttempt.status !== "EXPIRED" && existingAttempt.status !== "REJECTED") {
        const unlockAt = existingAttempt.expiresAt
          ? `<t:${Math.floor(existingAttempt.expiresAt.getTime() / 1000)}:R>`
          : "za jakiś czas";
        return interaction.editReply({
          content:
            `❌ Masz już aktywną próbę weryfikacji w toku. Będzie można spróbować ponownie ${unlockAt}, ` +
            `chyba że moderator ją wcześniej rozpatrzy. Możesz też skontaktować się z supportem.`,
        });
      }

      const firstNameIC = interaction.fields.getTextInputValue("firstNameIC").trim();
      const lastNameIC = interaction.fields.getTextInputValue("lastNameIC").trim();
      const rawDate = interaction.fields.getTextInputValue("birthDateIC").trim();
      const robloxUsername = interaction.fields.getTextInputValue("robloxUsername").trim();

      // Walidacja daty
      const birthDate = this._parseDate(rawDate);
      if (!birthDate) {
        await logError("verificationService", "INVALID_DATE_FORMAT", `Użytkownik ${interaction.user.id} podał błędną datę: ${rawDate}`, { userId: interaction.user.id });
        return interaction.editReply({
          content: "❌ Nieprawidłowy format daty. Użyj DD.MM.RRRR z prawdziwą datą (np. 14.03.2001).",
        });
      }

      // Walidacja wieku (musi być co najmniej 13 lat)
      const age = this._calculateAge(birthDate);
      if (age < 13) {
        await logError("verificationService", "AGE_TOO_LOW", `Użytkownik ${interaction.user.id} za młody: ${age} lat`, { userId: interaction.user.id, age });
        return interaction.editReply({
          content: "❌ Musisz mieć co najmniej 13 lat, aby się zweryfikować.",
        });
      }

      if (age > 120) {
        await logError("verificationService", "AGE_TOO_HIGH", `Użytkownik ${interaction.user.id} za stary: ${age} lat`, { userId: interaction.user.id, age });
        return interaction.editReply({
          content: "❌ Wpisana data urodzenia wydaje się nieprawidłowa (za dawno temu).",
        });
      }

      // Weryfikacja konta Roblox
      const robloxUser = await robloxClient.getUserIdByUsername(robloxUsername).catch((err) => {
        logError("verificationService", "ROBLOX_API_ERROR", err.message, { userId: interaction.user.id, robloxUsername });
        return null;
      });

      if (!robloxUser) {
        return interaction.editReply(
          `❌ Nie znaleziono użytkownika Roblox o nazwie "${robloxUsername}". Sprawdź pisownię i spróbuj ponownie.`
        );
      }

      // Bramka 3: czy to konto Roblox jest już używane?
      const robloxAlreadyUsed = await prisma.discordUser.findFirst({
        where: { robloxId: String(robloxUser.id), verifiedAt: { not: null } },
      });
      if (robloxAlreadyUsed) {
        await logError("verificationService", "ROBLOX_ALREADY_LINKED", `Konto Roblox ${robloxUsername} już powiązane`, {
          userId: interaction.user.id,
          robloxId: robloxUser.id,
        });
        return interaction.editReply(
          `❌ Konto Roblox "${robloxUser.name}" jest już powiązane z innym kontem Discord.`
        );
      }

      // Generuj captchę
      const config = await this._getConfig();
      const captcha = generateCaptcha(config.captchaCodeLength);

      // Zapisz w pamięci (krótkotrwale, na czas sesji)
      this._pendingVerifications.set(interaction.user.id, {
        firstNameIC,
        lastNameIC,
        birthDate,
        age,
        robloxUserId: robloxUser.id,
        robloxUsername: robloxUser.name,
        captchaCode: captcha.code,
        captchaVerified: false,
        verificationCode: null,
        createdAt: Date.now(),
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_captcha_button")
          .setLabel("📝 Wpisz kod z obrazka")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({
        content: "✅ Dane zapisane! Przepisz kod z obrazka poniżej (Krok 2/3):",
        files: [captcha.attachment],
        components: [row],
      });

      await logAction("verification_step1", interaction.user.id, null, {
        firstName: firstNameIC,
        lastName: lastNameIC,
        robloxUsername: robloxUser.name,
      });
    } catch (err) {
      await logError("verificationService", "MODAL_SUBMIT_ERROR", err.message, {
        userId: interaction.user.id,
        stack: err.stack,
      });
      await interaction.editReply("❌ Błąd serwera. Skontaktuj się z supportem.").catch(() => null);
    }
  }

  /**
   * Krok 2: Przycisk pod captchą — otwiera modal na wpisanie kodu
   */
  buildCaptchaModal() {
    return new ModalBuilder()
      .setCustomId("verify_captcha_modal_v2")
      .setTitle("Weryfikacja IC — Krok 2/3")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("kod")
            .setLabel("Kod z obrazka (6 znaków)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(6)
            .setMaxLength(6)
        )
      );
  }

  /**
   * Krok 2b: Submit captchy
   */
  async handleCaptchaModalSubmit(interaction) {
    try {
      const pending = this._pendingVerifications.get(interaction.user.id);
      if (!pending) {
        return interaction.reply({
          content: "❌ Brak aktywnej weryfikacji. Zacznij od nowa klikając przycisk na kanale weryfikacji.",
          ephemeral: true,
        });
      }

      if (Date.now() - pending.createdAt > 15 * 60 * 1000) {
        this._pendingVerifications.delete(interaction.user.id);
        await logError("verificationService", "CAPTCHA_TIMEOUT", "Sesja weryfikacji wygasła", { userId: interaction.user.id });
        return interaction.reply({
          content: "❌ Sesja weryfikacji wygasła (timeout 15 minut). Zacznij od nowa.",
          ephemeral: true,
        });
      }

      const kod = interaction.fields.getTextInputValue("kod").trim().toUpperCase();
      if (kod !== pending.captchaCode) {
        await logError("verificationService", "WRONG_CAPTCHA", `Błędny kod: ${kod} (oczekiwano: ${pending.captchaCode})`, {
          userId: interaction.user.id,
        });
        return interaction.reply({
          content: `❌ Błędny kod (próba ${(pending.captchaAttempts || 0) + 1}/3). Spróbuj ponownie.`,
          ephemeral: true,
        });
      }

      pending.captchaVerified = true;
      const config = await this._getConfig();
      pending.verificationCode = `UC-${randomCode(config.robloxCodeLength)}`;

      const embed = new EmbedBuilder()
        .setTitle("🎮 Ostatni krok — potwierdź konto Roblox (Krok 3/3)")
        .setDescription(
          `${config.robloxInstructions}\n\n` +
          `**Twój kod (wklej dokładnie):**\n` +
          `\`\`\`${pending.verificationCode}\`\`\`\n\n` +
          `Po udanej weryfikacji możesz usunąć kod z opisu.`
        )
        .setColor(0x1a2a6c)
        .setFooter({ text: "Ten kod jest ważny przez 10 minut" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_roblox_check_button")
          .setLabel("✅ Sprawdzam — kliknij gdy wkleiłem kod")
          .setStyle(ButtonStyle.Success)
      );

      await logAction("verification_step2", interaction.user.id, null, { captchaSuccess: true });

      return interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
      });
    } catch (err) {
      await logError("verificationService", "CAPTCHA_MODAL_ERROR", err.message, { userId: interaction.user.id, stack: err.stack });
      await interaction.reply("❌ Błąd serwera.").catch(() => null);
    }
  }

  /**
   * Krok 3: Przycisk "Sprawdzam" — odczyt profilu Roblox
   */
  async handleRobloxCheckButton(interaction) {
    try {
      const pending = this._pendingVerifications.get(interaction.user.id);
      if (!pending || !pending.captchaVerified) {
        return interaction.reply({
          content: "❌ Brak aktywnej weryfikacji na tym etapie. Zacznij od nowa.",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const description = await robloxClient.getUserDescription(pending.robloxUserId);
      if (description === null) {
        await logError("verificationService", "ROBLOX_PROFILE_FETCH_ERROR", "Nie udało się pobrać profilu", {
          userId: interaction.user.id,
          robloxId: pending.robloxUserId,
        });
        return interaction.editReply(
          "❌ Nie udało się pobrać profilu Roblox. Spróbuj ponownie za chwilę (Roblox czasem potrzebuje 1-2 minut na aktualizację)."
        );
      }

      if (!description.includes(pending.verificationCode)) {
        return interaction.editReply(
          `❌ Nie znaleziono kodu w opisie profilu. Upewnij się, że:\n` +
          `1. Wkleiłeś DOKŁADNIE: \`${pending.verificationCode}\`\n` +
          `2. Zapisałeś zmiany na Roblox\n` +
          `3. Czekaj 1-2 minuty na aktualizację (Roblox jest powolny)\n` +
          `Spróbuj ponownie.`
        );
      }

      // ✅ Roblox OK — teraz analiza AI
      await interaction.editReply("⏳ Analizuję dane weryfikacji AI...");

      const config = await this._getConfig();
      let aiAnalysis = null;
      let aiScore = 0.95; // domyślnie wysoki score
      let aiFlags = [];

      if (config.aiReviewRequired) {
        aiAnalysis = await this._analyzeVerificationWithAi(
          pending.firstNameIC,
          pending.lastNameIC,
          pending.birthDate,
          pending.age,
          pending.robloxUsername
        ).catch((err) => {
          logError("verificationService", "AI_ANALYSIS_ERROR", err.message, { userId: interaction.user.id });
          return { analysis: null, score: 0.8, flags: ["ai_analysis_failed"] };
        });

        if (aiAnalysis) {
          aiScore = aiAnalysis.score || 0.8;
          aiFlags = aiAnalysis.flags || [];
        }
      }

      // Utwórz VerificationAttempt w bazie (czeka na manualny przegląd)
      const genderIC = this._inferGenderFromName(pending.firstNameIC);
      const pesel = generatePesel(pending.birthDate, genderIC);

      const attempt = await prisma.verificationAttempt.upsert({
        where: { userId: interaction.user.id },
        create: {
          userId: interaction.user.id,
          firstNameIC: pending.firstNameIC,
          lastNameIC: pending.lastNameIC,
          birthDateIC: pending.birthDate,
          genderIC,
          robloxUserId: String(pending.robloxUserId),
          robloxUsername: pending.robloxUsername,
          captchaVerified: true,
          robloxVerified: true,
          aiAnalysis: JSON.stringify(aiAnalysis || {}),
          aiScore,
          aiFlags,
          aiAnalyzedAt: new Date(),
          status: config.manualReviewRequired ? "PENDING_MANUAL_REVIEW" : "VERIFIED",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        update: {
          firstNameIC: pending.firstNameIC,
          lastNameIC: pending.lastNameIC,
          birthDateIC: pending.birthDate,
          genderIC,
          robloxUserId: String(pending.robloxUserId),
          robloxUsername: pending.robloxUsername,
          captchaVerified: true,
          robloxVerified: true,
          aiAnalysis: JSON.stringify(aiAnalysis || {}),
          aiScore,
          aiFlags,
          aiAnalyzedAt: new Date(),
          status: config.manualReviewRequired ? "PENDING_MANUAL_REVIEW" : "VERIFIED",
          // Ta próba to w praktyce nowe podejście (poprzednia mogła być EXPIRED/REJECTED),
          // więc odświeżamy 24h licznik - inaczej dbgenerated default zadziałałby
          // tylko przy INSERT, a nie przy tym UPDATE.
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      if (!config.manualReviewRequired && aiScore > 0.7) {
        // Auto-approve jeśli nie wymaga recenzji i AI score wysoki
        await this._autoApproveVerification(interaction.user.id, genderIC, pesel, interaction.guild);
        return interaction.editReply(
          `✅ **Weryfikacja zakończona!** Witaj, **${pending.firstNameIC} ${pending.lastNameIC}**!\n` +
          `Masz dostęp do serwera. Pamiętaj o usunięciu kodu z opisu profilu Roblox.`
        );
      } else if (config.manualReviewRequired) {
        // Wyślij do przeglądu manualnego
        await this._sendToManualReview(interaction.guild, attempt, pending, aiScore, aiFlags);
        return interaction.editReply(
          `✅ Twoja weryfikacja przeszła wstępną ocenę!\n\n` +
          `**Status:** Oczekiwanie na przegląd manualny (może zająć kilka godzin)\n` +
          `Otrzymasz wiadomość na Discordzie, gdy będzie gotowe. Dziękuję za cierpliwość!`
        );
      }
    } catch (err) {
      await logError("verificationService", "ROBLOX_CHECK_ERROR", err.message, {
        userId: interaction.user.id,
        stack: err.stack,
      });
      await interaction.editReply("❌ Błąd serwera. Skontaktuj się z supportem.").catch(() => null);
    }
  }

  /**
   * Analiza weryfikacji przez AI — ocena logiczności i anomalii
   */
  async _analyzeVerificationWithAi(firstName, lastName, birthDate, age, robloxUsername) {
    const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (!aiConfig || !aiConfig.verificationAiEnabled) return { score: 1.0, flags: [], analysis: null };

    const prompt = `Ocen czy poniższe dane weryfikacji są wiarygodne (1.0 = bardzo wiarygodne, 0.0 = fałszywe):

- Imię: ${firstName}
- Nazwisko: ${lastName}
- Wiek: ${age} lat
- Konto Roblox: ${robloxUsername}

Odpowiedź JSON: {"score": 0.0-1.0, "flags": ["lista_anomalii"], "reasoning": "krótkie wyjaśnienie"}`;

    try {
      const response = await generateAiReply(prompt, aiConfig, {
        isPremium: false,
        systemPrompt: "Jesteś ekspertem w detekcji oszustw. Zwracaj odpowiedź w JSON.",
      });

      const parsed = JSON.parse(response);
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
        flags: parsed.flags || [],
        analysis: parsed.reasoning || "",
      };
    } catch (err) {
      console.error("[verificationService] AI analysis error:", err.message);
      return { score: 0.8, flags: ["ai_parse_error"], analysis: null };
    }
  }

  /**
   * Wyślij weryfikację do kanału przeglądu manualnego
   */
  async _sendToManualReview(guild, attempt, pending, aiScore, aiFlags) {
    const reviewChannelId = (await require("../config/channels").getBoundChannelId("VERIFICATION_REVIEW")) ||
      (await require("../config/channels").getBoundChannelId("LOG_MOD"));

    if (!reviewChannelId) {
      console.warn("[verificationService] Brak kanału VERIFICATION_REVIEW, pomijam wysłanie embeda");
      return;
    }

    const channel = await guild.channels.fetch(reviewChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🔍 Nowa weryfikacja do przeglądu")
      .setColor(aiScore < 0.6 ? 0xff6b6b : 0xffd700)
      .addFields(
        { name: "👤 Kandydat", value: `<@${attempt.userId}>`, inline: true },
        { name: "📛 Imię IC", value: pending.firstNameIC, inline: true },
        { name: "📛 Nazwisko IC", value: pending.lastNameIC, inline: true },
        { name: "🎮 Roblox", value: pending.robloxUsername, inline: true },
        { name: "🎂 Wiek", value: `${pending.age} lat`, inline: true },
        {
          name: "🤖 AI Score",
          value: `${(aiScore * 100).toFixed(0)}% ${aiScore > 0.8 ? "✅" : aiScore > 0.5 ? "⚠️" : "❌"}`,
          inline: true,
        }
      );

    if (aiFlags.length > 0) {
      embed.addField("🚩 Flagi AI", aiFlags.join(", "));
    }

    const acceptBtn = new ButtonBuilder()
      .setCustomId(`verification_accept:${attempt.id}`)
      .setLabel("✅ Zaakceptuj")
      .setStyle(ButtonStyle.Success);

    const rejectBtn = new ButtonBuilder()
      .setCustomId(`verification_reject:${attempt.id}`)
      .setLabel("❌ Odrzuć")
      .setStyle(ButtonStyle.Danger);

    const moreInfoBtn = new ButtonBuilder()
      .setCustomId(`verification_moreinfo:${attempt.id}`)
      .setLabel("❓ Więcej info")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(acceptBtn, rejectBtn, moreInfoBtn);

    await channel.send({ embeds: [embed], components: [row] });
    await logAction("verification_to_manual_review", attempt.userId, null, { attemptId: attempt.id, aiScore });
  }

  /**
   * Auto-zatwierdzenie weryfikacji (gdy nie wymaga recenzji manualnej)
   */
  async _autoApproveVerification(userId, genderIC, pesel, guild) {
    // Utwórz Character
    const pending = this._pendingVerifications.get(userId);
    await prisma.discordUser.upsert({
      where: { id: userId },
      update: {
        robloxId: String(pending.robloxUserId),
        robloxUsername: pending.robloxUsername,
        verifiedAt: new Date(),
      },
      create: {
        id: userId,
        robloxId: String(pending.robloxUserId),
        robloxUsername: pending.robloxUsername,
        verifiedAt: new Date(),
      },
    });

    await prisma.character.create({
      data: {
        userId,
        firstNameIC: pending.firstNameIC,
        lastNameIC: pending.lastNameIC,
        birthDateIC: pending.birthDate,
        genderIC,
        pesel,
      },
    });

    // Nadaj rolę
    const verifiedRoleId = await getRoleIdForPermission("VERIFIED_ROLE");
    if (verifiedRoleId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      await member?.roles.add(verifiedRoleId).catch(() => null);
    }

    this._pendingVerifications.delete(userId);
    await logAction("verification_auto_approved", userId, null, { genderIC, pesel });
  }

/**
   * Przygotowanie logiki dla obsługi przycisków recenzji (w interactionCreate)
   */
  async handleManualReviewDecision(interaction, attemptId, decision) {
    try {
      // ZMIANA 1: Użycie flags: 64 zamiast ephemeral: true pozbywa się ostrzeżenia (warningu) z konsoli
      await interaction.deferReply({ flags: 64 });
    } catch (err) {
      await logError("verificationService", "DEFER_FAILED", err.message, { userId: interaction.user.id, stack: err.stack }).catch(() => null);
      return;
    }

    try {
      const allowed = await hasPermission(interaction.member, "MODERATE");
      if (!allowed) {
        return interaction.editReply({
          content: "❌ Nie masz uprawnień do rozpatrywania weryfikacji.",
        });
      }

      const attempt = await prisma.verificationAttempt.findUnique({
        where: { id: attemptId },
      });

      if (!attempt) {
        return interaction.editReply({ content: "❌ Nie znaleziono weryfikacji." });
      }

      if (attempt.status === "VERIFIED" || attempt.status === "REJECTED") {
        return interaction.editReply({
          content: "❌ Ta weryfikacja została już rozpatrzona.",
        });
      }

      // ZMIANA 3 (Przygotowanie): Pobieramy stary embed z wiadomości, aby go edytować
      const originalEmbed = interaction.message.embeds[0] 
        ? EmbedBuilder.from(interaction.message.embeds[0]) 
        : null;

      if (decision === "APPROVED") {
        const genderIC = this._inferGenderFromName(attempt.firstNameIC);
        const pesel = generatePesel(attempt.birthDateIC, genderIC);

        await prisma.discordUser.upsert({
          where: { id: attempt.userId },
          update: {
            robloxId: String(attempt.robloxUserId),
            robloxUsername: attempt.robloxUsername,
            verifiedAt: new Date(),
          },
          create: {
            id: attempt.userId,
            robloxId: String(attempt.robloxUserId),
            robloxUsername: attempt.robloxUsername,
            verifiedAt: new Date(),
          },
        });

        // ZMIANA 2: Używamy upsert zamiast create, co naprawia błąd Unique constraint failed (userId)
        await prisma.character.upsert({
          where: { userId: attempt.userId },
          update: {
            firstNameIC: attempt.firstNameIC,
            lastNameIC: attempt.lastNameIC,
            birthDateIC: attempt.birthDateIC,
            genderIC: attempt.genderIC,
            pesel,
          },
          create: {
            userId: attempt.userId,
            firstNameIC: attempt.firstNameIC,
            lastNameIC: attempt.lastNameIC,
            birthDateIC: attempt.birthDateIC,
            genderIC: attempt.genderIC,
            pesel,
          },
        });

        const verifiedRoleId = await getRoleIdForPermission("VERIFIED_ROLE");
        if (verifiedRoleId) {
          const member = await interaction.guild.members.fetch(attempt.userId).catch(() => null);
          await member?.roles.add(verifiedRoleId).catch(() => null);
        }

        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: {
            status: "VERIFIED",
            manualReview: {
              upsert: {
                create: {
                  reviewerId: interaction.user.id,
                  decision: "APPROVED",
                  notes: "Zaakceptowana ręcznie przez moderatora",
                },
                update: {
                  reviewerId: interaction.user.id,
                  decision: "APPROVED",
                  notes: "Zaakceptowana ręcznie przez moderatora",
                }
              },
            },
          },
        });

        let dmStatus = "";
        try {
          const user = await interaction.client.users.fetch(attempt.userId);
          await user.send("🎉 Twoja weryfikacja została zaakceptowana! Masz już dostęp do pełnego serwera.");
        } catch (dmErr) {
          dmStatus = "\n*(Użytkownik ma zablokowane wiadomości prywatne)*";
        }

        // ZMIANA 3 (Kolor): Edycja starego embeda i usunięcie przycisków
        if (originalEmbed) {
          originalEmbed.setColor(0x00ff00); // Zielony
          originalEmbed.setTitle("✅ Weryfikacja Zaakceptowana");
          originalEmbed.addFields({ name: "Rozpatrzył(a)", value: `<@${interaction.user.id}>`, inline: true });
          await interaction.message.edit({ embeds: [originalEmbed], components: [] }).catch(() => null);
        }

        await logAction("verification_approved_manual", attempt.userId, interaction.user.id, { attemptId });
        return interaction.editReply({ content: `✅ Weryfikacja zaakceptowana.${dmStatus}` });

      } else if (decision === "REJECTED") {
        
        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: {
            status: "REJECTED",
            manualReview: {
              upsert: {
                create: {
                  reviewerId: interaction.user.id,
                  decision: "REJECTED",
                  notes: "Odrzucona ręcznie przez moderatora",
                },
                update: {
                  reviewerId: interaction.user.id,
                  decision: "REJECTED",
                  notes: "Odrzucona ręcznie przez moderatora",
                }
              },
            },
          },
        });

        let dmStatus = "";
        try {
          const user = await interaction.client.users.fetch(attempt.userId);
          await user.send("❌ Twoja weryfikacja została odrzucona. Możesz spróbować ponownie za 24 godziny.");
        } catch (dmErr) {
          dmStatus = "\n*(Nie udało się wysłać DM - zablokowane wiadomości)*";
        }

        // ZMIANA 3 (Kolor): Edycja starego embeda na czerwony i usunięcie przycisków
        if (originalEmbed) {
          originalEmbed.setColor(0xff0000); // Czerwony
          originalEmbed.setTitle("❌ Weryfikacja Odrzucona");
          originalEmbed.addFields({ name: "Rozpatrzył(a)", value: `<@${interaction.user.id}>`, inline: true });
          await interaction.message.edit({ embeds: [originalEmbed], components: [] }).catch(() => null);
        }

        await logAction("verification_rejected_manual", attempt.userId, interaction.user.id, { attemptId });
        return interaction.editReply({ content: `❌ Weryfikacja odrzucona.${dmStatus}` });

      } else if (decision === "NEEDS_MORE_INFO") {
        
        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: {
            status: "PENDING_MANUAL_REVIEW", // powrót do kolejki
            manualReview: {
              upsert: {
                create: {
                  reviewerId: interaction.user.id,
                  decision: "NEEDS_MORE_INFO",
                  notes: "Wymaga dodatkowych informacji",
                },
                update: {
                  reviewerId: interaction.user.id,
                  decision: "NEEDS_MORE_INFO",
                  notes: "Wymaga dodatkowych informacji",
                }
              },
            },
          },
        });

        // ZMIANA 3 (Kolor): Edycja starego embeda na żółty (zostawiamy przyciski, by podjął decyzję później, lub usuwamy? Lepiej usunąć stare i np. zmusić do stworzenia nowego kanału lub użyć innego systemu, ale na ten moment usuwam przyciski)
        if (originalEmbed) {
          originalEmbed.setColor(0xffa500); // Żółty / Pomarańczowy
          originalEmbed.setTitle("❓ Wymaga więcej informacji");
          originalEmbed.addFields({ name: "Sprawdza", value: `<@${interaction.user.id}>`, inline: true });
          await interaction.message.edit({ embeds: [originalEmbed], components: [] }).catch(() => null);
        }

        await logAction("verification_needs_info", attempt.userId, interaction.user.id, { attemptId });
        return interaction.editReply({
          content: "❓ Oznaczono jako wymagające więcej informacji.",
        });
      }
    } catch (err) {
      await logError("verificationService", "MANUAL_REVIEW_ERROR", err.message, {
        userId: interaction.user.id,
        attemptId,
        stack: err.stack,
      });
      await interaction.editReply("❌ Błąd podczas przetwarzania decyzji.").catch(() => null);
    }
  }

  async _getConfig() {
    const config = await prisma.verificationConfig.findUnique({ where: { id: "singleton" } });
    return (
      config ?? {
        captchaCodeLength: 6,
        robloxCodeLength: 8,
        robloxInstructions:
          'Wejdź na swój profil Roblox → Edytuj profil → Opis (About), wklej podany kod, zapisz zmiany, wróć tutaj i kliknij "Sprawdź teraz".',
        manualReviewRequired: true,
        aiReviewRequired: true,
      }
    );
  }

  _parseDate(raw) {
    const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;

    const dd = Number(match[1]);
    const mm = Number(match[2]);
    const yyyy = Number(match[3]);

    // Zakresy z grubsza (miesiąc 1-12, dzień 1-31, rok w rozsądnych granicach)
    // zanim w ogóle spróbujemy zbudować obiekt Date.
    const currentYear = new Date().getFullYear();
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;
    if (yyyy < currentYear - 120 || yyyy > currentYear) return null;

    const date = new Date(yyyy, mm - 1, dd);
    if (Number.isNaN(date.getTime())) return null;

    // JS Date "przewija" nieprawidłowe kombinacje (np. 30 lutego -> 2 marca)
    // zamiast rzucić błąd. Sprawdzamy, że to co odczytaliśmy z powrotem
    // faktycznie zgadza się z tym, co wpisał użytkownik - to łapie właśnie
    // takie przypadki jak 30.02.2001 czy (przy braku wcześniejszych limitów)
    // rollover miesięcy/dni poza zakres.
    if (date.getFullYear() !== yyyy || date.getMonth() !== mm - 1 || date.getDate() !== dd) {
      return null;
    }

    return date;
  }

  _calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  _inferGenderFromName(firstName) {
    return firstName.toLowerCase().endsWith("a") ? "FEMALE" : "MALE";
  }
}

module.exports = new VerificationServiceV2();
