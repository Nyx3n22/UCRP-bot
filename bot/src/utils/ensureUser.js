/**
 * utils/ensureUser.js
 * Wiele tabel (Grade, Punishment, Ticket, ExamAnswer, VerificationReview,
 * ApplicationReview, AiUsageLog) ma WYMAGANĄ relację do DiscordUser.
 * Bez wiersza DiscordUser próba utworzenia rekordu kończy się błędem
 * klucza obcego (P2003). Ten helper gwarantuje istnienie wiersza.
 */

const prisma = require("../lib/prisma");

/** Tworzy wiersz DiscordUser jeśli nie istnieje. Idempotentne. */
async function ensureDiscordUser(discordId) {
  await prisma.discordUser.upsert({
    where: { id: discordId },
    update: {},
    create: { id: discordId },
  });
}

module.exports = { ensureDiscordUser };
