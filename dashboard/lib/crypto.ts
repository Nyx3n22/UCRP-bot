import crypto from "crypto";

// Klucz ładowany leniwie (dopiero przy pierwszym szyfrowaniu), a nie na
// poziomie modułu - inaczej brak/zły ENCRYPTION_KEY crashował import tego
// pliku w KAŻDYM miejscu (nawet tam, gdzie szyfrowanie nie jest potrzebne),
// z kryptogenicznym TypeError z głębi Buffer.
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("Brak zmiennej środowiskowej ENCRYPTION_KEY.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY musi być 32-bajtowym kluczem w base64.");
  return key;
}

export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
