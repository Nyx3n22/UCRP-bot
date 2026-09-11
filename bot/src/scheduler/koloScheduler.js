/**
 * scheduler/koloScheduler.js
 * Cykliczne sprawdzanie (co 15 min):
 *  1) Zaproszenia (KoloInvite) z upływem terminu (72h) -> EXPIRED,
 *     powiadomienie lidera + przeliczenie minimum (start licznika 72h dla
 *     zgłoszeń, które nie zebrały kompletu).
 *  2) Koła poniżej wymaganego minimum od >72h (Kolo.belowMinSince):
 *       - ACTIVE          -> auto-rozwiązanie (DISSOLVED),
 *       - PENDING_MEMBERS -> auto-odrzucenie zgłoszenia (REJECTED), bo
 *         zaproszeni nie zaakceptowali i komplet się nie zebrał.
 *     W obu przypadkach: usunięcie kategorii/kanałów/ról (jeśli istnieją),
 *     wyczyszczenie członkostw + przydziałów do badań, wygaszenie wiszących
 *     zaproszeń, zwolnienie nazwy i DM do każdego (byłego) członka.
 *  3) Sprzątanie sierot: martwe koła (REJECTED/DISSOLVED), przy których
 *     z jakiegokolwiek powodu zostały wpisy członków/zaproszeń - np. po
 *     starszej wersji bota albo po teardownzie przerwanym brakiem dostępu
 *     do serwera Kół. Bez tego taka osoba byłaby na zawsze "w kole",
 *     którego już nie ma (blokada założenia nowego / przyjęcia zaproszenia).
 *  4) Utrzymanie AKTYWNYCH kół (maintainActiveKola): uprawnienia zarządu na
 *     serwerze Kół, wymóg aktywności (ostrzeżenie -> rozwiązanie) i
 *     odświeżenie paneli DM zarządu oraz członków.
 */

const prisma = require("../lib/prisma");
const { logError, logAction } = require("../utils/logger");
const { getKolaGuild } = require("../config/kolaGuild");
const koloService = require("../services/koloService");
const applicationServiceV2 = require("../services/applicationServiceV2");
const partnerstwoService = require("../services/partnerstwoService");
const ticketService = require("../services/ticketService");
const verificationServiceV2 = require("../services/verificationServiceV2");

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;
const DEAD_STATUSES = ["REJECTED", "DISSOLVED"];

async function checkExpiredInvites(client) {
  const expired = await prisma.koloInvite.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    include: { kolo: true },
  });

  const touchedKola = new Set();

  for (const invite of expired) {
    await prisma.koloInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });

    if (DEAD_STATUSES.includes(invite.kolo.status)) continue;

    const leader = await client.users.fetch(invite.kolo.leaderId).catch(() => null);
    await leader
      ?.send(
        `⌛ Zaproszenie do koła **${invite.kolo.name}** dla <@${invite.userId}> wygasło (72h bez odpowiedzi). ` +
          "Zaproś kogoś innego przyciskiem 📨 Zaproś osobę na panelu koła (DM) - działa i przed, i po zatwierdzeniu koła."
      )
      .catch(() => null);

    touchedKola.add(invite.koloId);
  }

  // Wygasłe zaproszenia to zwykle koniec szans na komplet - przeliczamy
  // minimum, żeby (jeśli nie ma już żadnych wiszących zaproszeń) wystartował
  // licznik 72h, po którym zgłoszenie/koło zostanie zamknięte, a
  // członkostwa wyczyszczone. Bez tego zgłoszenie wisiało w
  // PENDING_MEMBERS wiecznie i blokowało lidera oraz zaakceptowane osoby.
  for (const koloId of touchedKola) {
    try {
      await koloService._checkMinimumMembers(client, koloId);
    } catch (err) {
      await logError("koloScheduler", "CHECK_MINIMUM_ERROR", err.message, { koloId, stack: err.stack });
    }
  }
}

async function checkBelowMinimumDissolutions(client) {
  const stuck = await prisma.kolo.findMany({
    where: {
      status: { in: ["ACTIVE", "PENDING_MEMBERS"] },
      belowMinSince: { lt: new Date(Date.now() - GRACE_PERIOD_MS) },
    },
  });

  for (const kolo of stuck) {
    try {
      const isApplication = kolo.status === "PENDING_MEMBERS";
      // _dissolveKolo sam pobiera serwer Kół i czyści bazę NAWET gdy jest
      // on niedostępny - członkostwa nie mogą przetrwać koła, którego nie ma.
      await koloService._dissolveKolo(client, kolo, {
        finalStatus: isApplication ? "REJECTED" : "DISSOLVED",
        nameSuffix: isApplication ? "odrzucone" : "rozwiazane",
        dmText: isApplication
          ? `❌ Zgłoszenie koła **${kolo.name}** zostało automatycznie odrzucone - zaproszone osoby nie przyjęły zaproszeń i w 72h nie udało się zebrać wymaganego minimum. ` +
            "Nie należysz już do żadnego koła: możesz założyć nowe albo przyjąć zaproszenie do istniejącego."
          : `💥 Koło **${kolo.name}** zostało automatycznie rozwiązane - liczba członków była poniżej minimum dłużej niż 72h. ` +
            "Nie należysz już do żadnego koła: możesz założyć nowe albo przyjąć zaproszenie do istniejącego.",
        action: isApplication ? "kolo_auto_rejected" : "kolo_auto_dissolved",
      });
    } catch (err) {
      await logError("koloScheduler", "AUTO_DISSOLVE_ERROR", err.message, { koloId: kolo.id, stack: err.stack });
    }
  }
}

/**
 * Utrzymanie ŻYWYCH kół między tickami:
 *  1) uprawnienia zarządu na serwerze Kół (lider = admin własnej kategorii,
 *     wicelider = moderator) - raz na proces dla każdego koła, żeby nadrobić
 *     też koła założone przed wprowadzeniem tych uprawnień,
 *  2) wymóg aktywności: ostrzeżenie po GeneralConfig.koloInactivityDays dni
 *     bezczynności, a 72h po ostrzeżeniu auto-rozwiązanie,
 *  3) odświeżenie paneli DM (zarząd i członkowie) - panel lidera ma trwałe
 *     ID w bazie, więc jeśli użytkownik go usunął, zostanie dosłany.
 */
async function maintainActiveKola(client) {
  const kola = await prisma.kolo.findMany({ where: { status: "ACTIVE" } });
  if (kola.length === 0) return;

  const guild = getKolaGuild(client);
  for (const kolo of kola) {
    try {
      if (guild && !koloService._isPermsApplied(kolo.id)) {
        await koloService._applyKoloPermissions(guild, kolo);
      }

      const outcome = await koloService._checkActivityRequirement(client, kolo);
      // Rozwiązane koło nie ma już członków ani paneli - nie odświeżamy.
      if (outcome === "dissolved") continue;

      await koloService.refreshPanels(client, kolo.id);
    } catch (err) {
      await logError("koloScheduler", "MAINTAIN_KOLO_ERROR", err.message, { koloId: kolo.id, stack: err.stack });
    }
  }
}

/**
 * Jednorazowe/okresowe sprzątanie wpisów, które przeżyły swoje koło:
 * członkowie i wiszące zaproszenia przy kołach REJECTED/DISSOLVED.
 */
async function cleanupOrphanedMemberships(client) {
  const orphans = await prisma.kolo.findMany({
    where: {
      status: { in: DEAD_STATUSES },
      OR: [{ members: { some: {} } }, { invites: { some: { status: "PENDING" } } }],
    },
  });
  if (orphans.length === 0) return;

  const guild = getKolaGuild(client);
  for (const kolo of orphans) {
    try {
      // Ten sam teardown co przy normalnym zamykaniu koła: status zostaje,
      // nazwa jest archiwizowana (jeśli jeszcze nie była), członkowie,
      // przydziały do badań i zaproszenia znikają, a infrastruktura na
      // serwerze Kół jest usuwana, o ile bot ma do niej dostęp.
      await koloService._teardownKolo(guild, kolo, {
        finalStatus: kolo.status,
        nameSuffix: kolo.status === "REJECTED" ? "odrzucone" : "rozwiazane",
      });
      await logAction("kolo_orphans_cleaned", "system", kolo.id, { name: kolo.name, status: kolo.status });
    } catch (err) {
      await logError("koloScheduler", "ORPHAN_CLEANUP_ERROR", err.message, { koloId: kolo.id, stack: err.stack });
    }
  }
}

function startKoloScheduler(client) {
  const tick = async () => {
    try {
      await koloService.ensurePanelPosted(client);
      await applicationServiceV2.ensurePanelsPosted(client);
      await partnerstwoService.ensurePanelPosted(client);
      await ticketService.ensurePanelPosted(client);
      await verificationServiceV2.ensurePanelPosted(client);
      await cleanupOrphanedMemberships(client);
      await checkExpiredInvites(client);
      await checkBelowMinimumDissolutions(client);
      await maintainActiveKola(client);
    } catch (err) {
      await logError("koloScheduler", "TICK_ERROR", err.message, { stack: err.stack });
    } finally {
      setTimeout(tick, CHECK_INTERVAL_MS);
    }
  };

  setTimeout(tick, 20_000); // po starcie klienta
}

// Funkcje sprawdzające są wyeksportowane osobno (poza startKoloScheduler),
// żeby dało się je wywołać doraźnie/diagnostycznie i przetestować.
module.exports = {
  startKoloScheduler,
  checkExpiredInvites,
  checkBelowMinimumDissolutions,
  cleanupOrphanedMemberships,
  maintainActiveKola,
};
