/**
 * utils/logger.js
 * Centralizowana obsługa logowania błędów i akcji
 */

const prisma = require("../lib/prisma");

/**
 * Loguje błąd do ErrorLog
 * @param {string} service - nazwa serwisu (np. "verificationService")
 * @param {string} errorType - typ błędu (np. "CAPTCHA_FAILED")
 * @param {string} message - wiadomość błędu
 * @param {object} context - dodatkowe dane (userId, itp.)
 * @param {string} severity - "INFO", "WARNING", "ERROR", "CRITICAL"
 */
async function logError(service, errorType, message, context = {}, severity = "ERROR") {
  try {
    await prisma.errorLog.create({
      data: {
        service,
        errorType,
        message,
        context,
        severity,
      },
    });
  } catch (err) {
    console.error(`[logger] Nie udało się zalogować błędu: ${err.message}`);
  }
  console.error(`[${service}] [${errorType}] ${message}`, context);
}

/**
 * Loguje akcję do ActionLog
 * @param {string} action - nazwa akcji (np. "verification_approved")
 * @param {string} actorId - ID osoby wykonującej akcję (np. userId)
 * @param {string} targetId - ID obiektu, na którym akcja się odbywa (opcjonalne)
 * @param {object} metadata - dodatkowe metadane
 */
async function logAction(action, actorId, targetId = null, metadata = {}) {
  try {
    await prisma.actionLog.create({
      data: {
        action,
        actorId,
        targetId,
        metadata,
      },
    });
  } catch (err) {
    console.error(`[logger] Nie udało się zalogować akcji: ${err.message}`);
  }
}

module.exports = { logError, logAction };
