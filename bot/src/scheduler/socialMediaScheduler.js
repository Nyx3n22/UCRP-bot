/**
 * scheduler/socialMediaScheduler.js
 * Rekurencyjny setTimeout zamiast setInterval, żeby po każdym cyklu
 * odczytać aktualny pollIntervalMinutes z Dashboardu (można go zmienić
 * bez restartu bota) i nie nakładać kolejnych wywołań, jeśli poprzedni
 * cykl trwał dłużej niż interwał.
 */

const prisma = require("../lib/prisma");
const socialMediaService = require("../services/socialMediaService");

const DEFAULT_INTERVAL_MINUTES = 5;

function startSocialMediaScheduler(client) {
  const tick = async () => {
    let intervalMinutes = DEFAULT_INTERVAL_MINUTES;
    try {
      const config = await prisma.socialMediaConfig.findUnique({ where: { id: "singleton" } });
      if (config) intervalMinutes = config.pollIntervalMinutes;
      await socialMediaService.pollAll(client);
    } catch (err) {
      console.error("[socialMediaScheduler] Błąd cyklu pollingu:", err);
    } finally {
      setTimeout(tick, intervalMinutes * 60 * 1000);
    }
  };

  // pierwszy cykl po 10s (daje czas klientowi Discorda na pełne wystartowanie)
  setTimeout(tick, 10_000);
}

module.exports = { startSocialMediaScheduler };
