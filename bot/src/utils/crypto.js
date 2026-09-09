/**
 * utils/crypto.js
 * Klucz API AI trzymany w bazie jest szyfrowany AES-256-GCM.
 * ENCRYPTION_KEY (32 bajty, base64) musi być ustawiony w .env bota i Dashboardu.
 *
 * UWAGA: klucz jest wczytywany LENIWIE (dopiero przy pierwszym użyciu),
 * żeby brak zmiennej nie wysadzał całego bota już przy starcie (przy
 * require tego modułu), tylko dawał czytelny błąd w miejscu użycia.
 */

const crypto = require("crypto");

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Brak zmiennej środowiskowej ENCRYPTION_KEY (32 bajty, base64). " +
        "Ustaw ją w .env bota i Dashboardu (musi być IDENTYCZNA w obu)."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY ma nieprawidłową długość (${key.length} bajtów zamiast 32). ` +
        "Wygeneruj nowy: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  cachedKey = key;
  return cachedKey;
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(payload) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
