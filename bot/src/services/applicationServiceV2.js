/**
 * services/applicationServiceV2.js
 *
 * Ulepszone podania z wstępną analizą AI (ocena treści, detekcja spamu).
 * Obsługuje przegląd manualny przez moderatorów z feedbackiem.
 */

const prisma = require("../lib/prisma");
const { getRoleIdForPermission, PERMISSION_KEYS } = require("../config/roles");
const { generateAiReply } = require("./aiGatewayService");
const { logError, logAction } = require("../utils/logger");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

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
      embed.addField("🚩 Flagi AI", aiFlags.join(", "));
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
}

module.exports = new ApplicationServiceV2();
