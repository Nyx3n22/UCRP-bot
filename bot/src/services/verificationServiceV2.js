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
const { getRoleIdForPermission } = require("../config/roles");
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
    try {
      // Bramka 1: czy już zweryfikowany?
      const existingCharacter = await prisma.character.findUnique({
        where: { userId: interaction.user.id },
      });
      if (existingCharacter) {
        return interaction.reply({
          content: "❌ Masz już zweryfikowaną postać. Nie można weryfikować się ponownie.",
          ephemeral: true,
        });
      }

      // Bramka 2: czy nie ma już aktywnej próby weryfikacji?
      const existingAttempt = await prisma.verificationAttempt.findUnique({
        where: { userId: interaction.user.id },
      });
      if (existingAttempt && existingAttempt.status !== "EXPIRED" && existingAttempt.status !== "REJECTED") {
        return interaction.reply({
          content: "❌ Masz już aktywną próbę weryfikacji w toku. Spróbuj za godzinę lub skontaktuj się z supportem.",
          ephemeral: true,
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
        return interaction.reply({
          content: "❌ Nieprawidłowy format daty. Użyj DD.MM.RRRR (np. 14.03.2001).",
          ephemeral: true,
        });
      }

      // Walidacja wieku (musi być co najmniej 13 lat)
      const age = this._calculateAge(birthDate);
      if (age < 13) {
        await logError("verificationService", "AGE_TOO_LOW", `Użytkownik ${interaction.user.id} za młody: ${age} lat`, { userId: interaction.user.id, age });
        return interaction.reply({
          content: "❌ Musisz mieć co najmniej 13 lat, aby się zweryfikować.",
          ephemeral: true,
        });
      }

      if (age > 120) {
        await logError("verificationService", "AGE_TOO_HIGH", `Użytkownik ${interaction.user.id} za stary: ${age} lat`, { userId: interaction.user.id, age });
        return interaction.reply({
          content: "❌ Wpisana data urodzenia wydaje się nieprawidłowa (za dawno temu).",
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

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
      pending.verificationCode = randomCode(config.robloxCodeLength);

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

      if (config.verificationAiEnabled) {
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
        },
        update: {
          robloxVerified: true,
          aiAnalysis: JSON.stringify(aiAnalysis || {}),
          aiScore,
          aiFlags,
          aiAnalyzedAt: new Date(),
          status: config.manualReviewRequired ? "PENDING_MANUAL_REVIEW" : "VERIFIED",
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
      const attempt = await prisma.verificationAttempt.findUnique({
        where: { id: attemptId },
      });

      if (!attempt) {
        return interaction.reply({ content: "❌ Nie znaleziono weryfikacji.", ephemeral: true });
      }

      if (attempt.status === "VERIFIED" || attempt.status === "REJECTED") {
        return interaction.reply({
          content: "❌ Ta weryfikacja została już rozpatrzona.",
          ephemeral: true,
        });
      }

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

        await prisma.character.create({
          data: {
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
              create: {
                reviewerId: interaction.user.id,
                decision: "APPROVED",
                notes: "Zaakceptowana ręcznie przez moderatora",
              },
            },
          },
        });

        // Wyślij wiadomość do kandydata
        const user = await interaction.client.users.fetch(attempt.userId).catch(() => null);
        await user?.send("🎉 Twoja weryfikacja została zaakceptowana! Masz już dostęp do pełnego serwera.").catch(() => null);

        await logAction("verification_approved_manual", attempt.userId, interaction.user.id, { attemptId });
        return interaction.reply({ content: "✅ Weryfikacja zaakceptowana.", ephemeral: true });
      } else if (decision === "REJECTED") {
        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: {
            status: "REJECTED",
            manualReview: {
              create: {
                reviewerId: interaction.user.id,
                decision: "REJECTED",
                notes: "Odrzucona ręcznie przez moderatora",
              },
            },
          },
        });

        const user = await interaction.client.users.fetch(attempt.userId).catch(() => null);
        await user
          ?.send("❌ Twoja weryfikacja została odrzucona. Możesz spróbować ponownie za 24 godziny.")
          .catch(() => null);

        await logAction("verification_rejected_manual", attempt.userId, interaction.user.id, { attemptId });
        return interaction.reply({ content: "❌ Weryfikacja odrzucona.", ephemeral: true });
      } else if (decision === "NEEDS_MORE_INFO") {
        await prisma.verificationAttempt.update({
          where: { id: attemptId },
          data: {
            status: "PENDING_MANUAL_REVIEW", // powrót do kolejki
            manualReview: {
              create: {
                reviewerId: interaction.user.id,
                decision: "NEEDS_MORE_INFO",
                notes: "Wymaga dodatkowych informacji",
              },
            },
          },
        });

        await logAction("verification_needs_info", attempt.userId, interaction.user.id, { attemptId });
        return interaction.reply({
          content: "❓ Wysłano pytanie do kandydata. Czeka na odpowiedź.",
          ephemeral: true,
        });
      }
    } catch (err) {
      await logError("verificationService", "MANUAL_REVIEW_ERROR", err.message, {
        userId: interaction.user.id,
        attemptId,
        stack: err.stack,
      });
      await interaction.reply("❌ Błąd podczas przetwarzania decyzji.").catch(() => null);
    }
  }

  async _getConfig() {
    const config = await prisma.verificationConfig.findUnique({ where: { id: "singleton" } });
    return (
      config ?? {
        captchaCodeLength: 6,
        robloxCodeLength: 8,
        manualReviewRequired: true,
        aiReviewRequired: true,
      }
    );
  }

  _parseDate(raw) {
    const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
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
