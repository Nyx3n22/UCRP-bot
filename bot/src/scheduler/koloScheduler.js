/**
 * scheduler/koloScheduler.js
 * Cykliczne sprawdzanie (co 15 min):
 *  1) Zaproszenia (KoloInvite) z upływem terminu (72h) -> EXPIRED,
 *     powiadomienie lidera żeby zaprosił kogoś innego.
 *  2) Koła ACTIVE, które są poniżej wymaganego minimum od >72h
 *     (Kolo.belowMinSince ustawiane przez koloService przy
 *     wyrzuceniu/opuszczeniu koła) -> auto-rozwiązanie: usunięcie
 *     3 ról z serwera, oznaczenie DISSOLVED, powiadomienie wszystkich.
 */

const prisma = require("../lib/prisma");
const { logError, logAction } = require("../utils/logger");
const koloService = require("../services/koloService");

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;

async function checkExpiredInvites(client) {
  const expired = await prisma.koloInvite.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    include: { kolo: true },
  });

  for (const invite of expired) {
    await prisma.koloInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });

    if (invite.kolo.status === "DISSOLVED" || invite.kolo.status === "REJECTED") continue;

    const leader = await client.users.fetch(invite.kolo.leaderId).catch(() => null);
    await leader
      ?.send(
        `⌛ Zaproszenie do koła **${invite.kolo.name}** dla <@${invite.userId}> wygasło (72h bez odpowiedzi). ` +
          "Użyj `/kolo zaprosz`, aby zaprosić kogoś innego."
      )
      .catch(() => null);
  }
}

async function checkBelowMinimumDissolutions(client) {
  const stuck = await prisma.kolo.findMany({
    where: { status: "ACTIVE", belowMinSince: { lt: new Date(Date.now() - GRACE_PERIOD_MS) } },
    include: { members: true },
  });

  for (const kolo of stuck) {
    try {
      const guild = client.guilds.cache.first();

      for (const roleId of [kolo.roleIdMember, kolo.roleIdLeader, kolo.roleIdVice]) {
        if (!roleId) continue;
        const role = await guild?.roles.fetch(roleId).catch(() => null);
        await role?.delete("Koło Naukowe auto-rozwiązane - poniżej minimum osób przez >72h").catch(() => null);
      }

      await prisma.kolo.update({ where: { id: kolo.id }, data: { status: "DISSOLVED" } });

      for (const m of kolo.members) {
        const user = await client.users.fetch(m.userId).catch(() => null);
        await user
          ?.send(`💥 Koło **${kolo.name}** zostało automatycznie rozwiązane - liczba członków była poniżej minimum dłużej niż 72h.`)
          .catch(() => null);
      }

      await logAction("kolo_auto_dissolved", "system", kolo.id, { name: kolo.name });
    } catch (err) {
      await logError("koloScheduler", "AUTO_DISSOLVE_ERROR", err.message, { koloId: kolo.id, stack: err.stack });
    }
  }
}

function startKoloScheduler(client) {
  const tick = async () => {
    try {
      await koloService.ensurePanelPosted(client);
      await checkExpiredInvites(client);
      await checkBelowMinimumDissolutions(client);
    } catch (err) {
      await logError("koloScheduler", "TICK_ERROR", err.message, { stack: err.stack });
    } finally {
      setTimeout(tick, CHECK_INTERVAL_MS);
    }
  };

  setTimeout(tick, 20_000); // po starcie klienta
}

module.exports = { startKoloScheduler };
