/**
 * events/messageCreate.js
 * 1) Automod AI — analiza każdej wiadomości pod kątem toksyczności (jeśli włączone w AiConfig)
 * 2) Bramka AI — jeśli wiadomość jest na dozwolonym kanale AI, nalicza kredyty i odpowiada
 */

const prisma = require("../lib/prisma");
const { AiCreditService, CreditError } = require("../services/aiCreditService");
const { runAutomodCheck, generateAiReply } = require("../services/aiGatewayService");

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const config = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (!config) return;

    // --- Automod (działa na wszystkich kanałach, niezależnie od bramki AI) ---
    if (config.automodEnabled) {
      const verdict = await runAutomodCheck(message.content).catch(() => null);
      if (verdict?.violation) {
        await message.delete().catch(() => null);
        await prisma.actionLog.create({
          data: {
            actorId: "AUTOMOD",
            action: "AUTOMOD_DELETE",
            targetId: message.author.id,
            metadata: { reason: verdict.reason, content: message.content },
          },
        });
        return;
      }
    }

    // --- Bramka AI ---
    if (!config.allowedChannelIds.includes(message.channel.id)) return;

    try {
      const { charged, remaining, unlimited } = await AiCreditService.chargeForMessage(
        message.member,
        message.content
      );

      const reply = await generateAiReply(message.content, config);
      await message.reply(reply);

      if (!unlimited) {
        await message.channel
          .send({
            content: `_(-${charged} kredytu, pozostało: ${remaining.toFixed(2)})_`,
          })
          .catch(() => null);
      }
    } catch (err) {
      if (err instanceof CreditError) {
        return message.reply(`⚠️ ${err.message}`);
      }
      console.error("[messageCreate] Błąd bramki AI:", err);
    }
  },
};
