/**
 * utils/crypto.js
 * Klucz API AI trzymany w bazie jest szyfrowany AES-256-GCM.
 * ENCRYPTION_KEY (32 bajty, base64) musi być ustawiony w .env bota i Dashboardu.
 */

const crypto = require("crypto");

const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "base64"); // 32 bajty

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(payload) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = { encrypt, decrypt };
