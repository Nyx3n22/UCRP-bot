/**
 * services/applicationServiceV2.js
 *
 * Ulepszone podania z wstępną analizą AI (ocena treści, detekcja spamu).
 * Obsługuje przegląd manualny przez moderatorów z feedbackiem.
 */

const prisma = require("../lib/prisma");
const { getRoleIdForPermission, PERMISSION_KEYS } = require("../config/roles");
const { generateAiReply } = require("./aiGatewayService");
const { getBoundChannelId } = require("../config/channels");
const { logError, logAction } = require("../utils/logger");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require("discord.js");
const { generateBanner } = require("../utils/banner");

const ROLE_ON_ACCEPT = {
  STUDENT: PERMISSION_KEYS.STUDENT_ROLE,
  WYKLADOWCA: PERMISSION_KEYS.WYKLADOWCA_ROLE,
  ADMINISTRACJA: PERMISSION_KEYS.ADMINISTRACJA_ROLE,
};

class ApplicationServiceV2 {
  /**
   * Analiza podania przez AI
   */
  async analyzeApplicationWithAi(applicationData) {
    const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (!aiConfig || !aiConfig.applicationAiEnabled) {
      return { score: 0.75, flags: [], analysis: null };
    }

    const answersText = Object.values(applicationData.answers).join(" ");
    const prompt = `Analizuj podanie na studia. Zwróć JSON z oceną (0-1) oraz flagami anomalii.

Podanie:
${answersText}

Odpowiedź JSON: {"score": 0.0-1.0, "flags": ["lista_anomalii"], "sentiment": "positive/neutral/negative"}`;

    try {
      const response = await generateAiReply(prompt, aiConfig, {
        isPremium: false,
        systemPrompt:
          "Jesteś ekspertem w rekrutacji. Analizujesz podania studentów. Zwracaj odpowiedź w formacie JSON.",
      });

      const parsed = JSON.parse(response);
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
        flags: parsed.flags || [],
        sentiment: parsed.sentiment || "neutral",
        analysis: JSON.stringify(parsed),
      };
    } catch (err) {
      console.error("[applicationService] AI analysis error:", err.message);
      return {
        score: 0.6,
        flags: ["ai_analysis_error"],
        analysis: null,
      };
    }
  }

  /**
   * Przyjęcie/odrzucenie podania przez moderatora
   */
  async review(applicationId, reviewerId, decision, guild, reviewerNotes = "") {
    try {
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new Error("Nie znaleziono podania.");
      }

      if (application.status === "ACCEPTED" || application.status === "REJECTED") {
        throw new Error("To podanie zostało już rozpatrzone.");
      }

      // Utwórz ApplicationReview
      const review = await prisma.applicationReview.create({
        data: {
          applicationId,
          reviewerId,
          decision,
          internalNotes: reviewerNotes,
        },
      });

      // Zaktualizuj status aplikacji
      const updated = await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: decision,
          reviewedById: reviewerId,
        },
      });

      // Jeśli zaakceptowana, nadaj rolę
      if (decision === "ACCEPTED") {
        const permissionKey = ROLE_ON_ACCEPT[application.type];
        const roleId = permissionKey ? await getRoleIdForPermission(permissionKey) : null;
        if (roleId) {
          const member = await guild.members.fetch(application.userId).catch(() => null);
          await member?.roles.add(roleId).catch(() => null);
        }
      }

      await logAction("application_reviewed", reviewerId, application.userId, {
        applicationId,
        decision,
      });

      return updated;
    } catch (err) {
      await logError("applicationService", "REVIEW_ERROR", err.message, {
        applicationId,
        reviewerId,
        decision,
      });
      throw err;
    }
  }

  /**
   * Wyślij podanie do kanału recenzji
   */
  async sendToReviewChannel(guild, application, aiScore, aiFlags, channel) {
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(`📋 Nowe podanie — ${application.type}`)
      .setColor(aiScore < 0.5 ? 0xff6b6b : aiScore < 0.75 ? 0xffd700 : 0x51cf66)
      .addFields(
        { name: "👤 Kandydat", value: `<@${application.userId}>`, inline: true },
        {
          name: "🤖 AI Score",
          value: `${(aiScore * 100).toFixed(0)}% ${aiScore > 0.8 ? "✅" : aiScore > 0.5 ? "⚠️" : "❌"}`,
          inline: true,
        },
        {
          name: "📝 Treść",
          value: `\`\`\`\n${JSON.stringify(application.answers, null, 2).substring(0, 500)}...\n\`\`\``,
        }
      );

    if (aiFlags.length > 0) {
      embed.addFields({ name: "🚩 Flagi AI", value: aiFlags.join(", ") });
    }

    const acceptBtn = new ButtonBuilder()
      .setCustomId(`application_accept:${application.id}`)
      .setLabel("✅ Zaakceptuj")
      .setStyle(ButtonStyle.Success);

    const rejectBtn = new ButtonBuilder()
      .setCustomId(`application_reject:${application.id}`)
      .setLabel("❌ Odrzuć")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(acceptBtn, rejectBtn);

    await channel.send({ embeds: [embed], components: [row] });
  }

  // ==================== PANEL / ZGŁASZANIE (dawniej /aplikuj - nigdy nie istniało) ====================

  buildPanelEmbed(type) {
    const labels = {
      STUDENT: { title: "🎓 Podanie na studenta", desc: "Chcesz dołączyć jako student? Kliknij przycisk, aby złożyć podanie." },
      WYKLADOWCA: { title: "📋 Podanie na wykładowcę", desc: "Chcesz dołączyć do kadry akademickiej? Kliknij przycisk, aby złożyć podanie." },
      ADMINISTRACJA: { title: "🛡️ Podanie do administracji", desc: "Chcesz dołączyć do administracji serwera? Kliknij przycisk, aby złożyć podanie." },
    }[type];
    return new EmbedBuilder().setTitle(labels.title).setDescription(labels.desc).setColor(0x1a2a6c).setTimestamp();
  }

  buildPanelRow(type) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`application_start:${type}`).setLabel("📝 Złóż podanie").setStyle(ButtonStyle.Primary)
    );
  }

  async ensurePanelsPosted(client) {
    for (const [type, channelKey] of Object.entries({
      STUDENT: "APPLICATIONS_STUDENT",
      WYKLADOWCA: "APPLICATIONS_WYKLADOWCA",
      ADMINISTRACJA: "APPLICATIONS_ADMINISTRACJA",
    })) {
      try {
        const channelId = await getBoundChannelId(channelKey);
        if (!channelId) continue;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;

        const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
        const already = recent?.find(
          (m) => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === `application_start:${type}`
        );
        if (already) continue;

        const bannerTitles = { STUDENT: "Podanie na studenta", WYKLADOWCA: "Podanie na wykładowcę", ADMINISTRACJA: "Podanie do administracji" };
        const banner = new AttachmentBuilder(generateBanner(bannerTitles[type]), { name: "banner.png" });
        await channel.send({
          embeds: [this.buildPanelEmbed(type).setImage("attachment://banner.png")],
          components: [this.buildPanelRow(type)],
          files: [banner],
        });
      } catch (err) {
        await logError("applicationServiceV2", "PANEL_POST_ERROR", err.message, { type, stack: err.stack });
      }
    }
  }

  _questionsFor(type) {
    return {
      STUDENT: [
        { id: "motywacja", label: "Dlaczego chcesz do nas dołączyć?", style: TextInputStyle.Paragraph },
        { id: "wydzial", label: "Wybrany wydział", style: TextInputStyle.Short },
        { id: "doswiadczenie", label: "Doświadczenie w RP (opcjonalnie)", style: TextInputStyle.Paragraph, required: false },
      ],
      WYKLADOWCA: [
        { id: "motywacja", label: "Dlaczego chcesz uczyć na uczelni?", style: TextInputStyle.Paragraph },
        { id: "przedmiot", label: "Jaki przedmiot chcesz prowadzić?", style: TextInputStyle.Short },
        { id: "doswiadczenie", label: "Doświadczenie akademickie/RP", style: TextInputStyle.Paragraph },
      ],
      ADMINISTRACJA: [
        { id: "motywacja", label: "Dlaczego chcesz dołączyć do administracji?", style: TextInputStyle.Paragraph },
        { id: "dostepnosc", label: "Dostępność czasowa (godziny/dni)", style: TextInputStyle.Short },
        { id: "doswiadczenie", label: "Doświadczenie w moderacji", style: TextInputStyle.Paragraph },
      ],
    }[type];
  }

  buildApplicationModal(type) {
    const modal = new ModalBuilder().setCustomId(`application_modal:${type}`).setTitle("Formularz podania");
    for (const q of this._questionsFor(type)) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(q.id)
            .setLabel(q.label.slice(0, 45))
            .setStyle(q.style)
            .setRequired(q.required !== false)
            .setMaxLength(q.style === TextInputStyle.Paragraph ? 1000 : 200)
        )
      );
    }
    return modal;
  }

  async handleApplicationModalSubmit(interaction, type) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const existing = await prisma.application.findFirst({ where: { userId: interaction.user.id, type, status: "PENDING" } });
      if (existing) {
        return interaction.editReply("❌ Masz już aktywne podanie tego typu w trakcie rozpatrywania.");
      }

      const answers = {};
      for (const q of this._questionsFor(type)) {
        answers[q.id] = interaction.fields.getTextInputValue(q.id) || null;
      }

      const application = await prisma.application.create({ data: { userId: interaction.user.id, type, answers } });

      const ai = await this.analyzeApplicationWithAi({ answers });
      await prisma.application.update({
        where: { id: application.id },
        data: { aiAnalysis: ai.analysis, aiScore: ai.score, aiFlags: ai.flags, aiAnalyzedAt: new Date() },
      });

      const reviewChannelId = (await getBoundChannelId("APPLICATIONS_REVIEW")) || (await getBoundChannelId("LOG_MOD"));
      const reviewChannel = reviewChannelId ? await interaction.guild.channels.fetch(reviewChannelId).catch(() => null) : null;
      await this.sendToReviewChannel(interaction.guild, application, ai.score, ai.flags, reviewChannel);

      return interaction.editReply("✅ Podanie wysłane! Otrzymasz wiadomość, gdy zostanie rozpatrzone.");
    } catch (err) {
      await logError("applicationServiceV2", "MODAL_SUBMIT_ERROR", err.message, { userId: interaction.user.id, type, stack: err.stack });
      return interaction.editReply("❌ Błąd serwera. Spróbuj ponownie.").catch(() => null);
    }
  }
}

module.exports = new ApplicationServiceV2();
