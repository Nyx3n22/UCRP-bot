/**
 * utils/embeds.js
 *
 * Centralny system wyglądu wiadomości bota — jedna paleta, jedna stopka,
 * spójne kolory statusów we wszystkich komendach i serwisach.
 *
 * Paleta (spójna z Dashboardem):
 *  - BRASS / GOLD  — panele, nagłówki, marka uczelni
 *  - BURGUNDY      — sprawy studenckie, USOS, legitymacje
 *  - INK           — ogłoszenia, rzeczy oficjalne
 *  - SUCCESS/WARNING/ERROR/INFO — statusy operacji
 */

const { EmbedBuilder } = require("discord.js");

const COLORS = {
  BRASS: 0xc9a15a,
  BRASS_LIGHT: 0xdcbf85,
  GOLD: 0xd9a441,
  BURGUNDY: 0x8a2547,
  CRIMSON: 0x8a1538,
  INK: 0x1a2a6c,
  INFO: 0x2a52be,
  SUCCESS: 0x2ecc71,
  WARNING: 0xe67e22,
  ERROR: 0xe74c3c,
  LEVEL: 0xf4900c,
  KOLO: 0x2b6cb0,
};

const BRAND_FOOTER = "Uniwersytet Centralny RP";
const DIVIDER = "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";

/**
 * Bazowy embed z marką uczelni (stopka + timestamp).
 * @param {object} opts { title, description, color, thumbnail, image, fields, footer }
 */
function base({ title, description, color = COLORS.BRASS, thumbnail, image, fields, footer } = {}) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp().setFooter({ text: footer || BRAND_FOOTER });
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (fields) embed.addFields(fields);
  return embed;
}

/** Zielony embed sukcesu. */
function success(title, description, extra = {}) {
  return base({ title: `✅ ${title}`, description, color: COLORS.SUCCESS, ...extra });
}

/** Czerwony embed błędu. */
function error(title, description, extra = {}) {
  return base({ title: `❌ ${title}`, description, color: COLORS.ERROR, ...extra });
}

/** Bursztynowy embed ostrzeżenia. */
function warning(title, description, extra = {}) {
  return base({ title: `⚠️ ${title}`, description, color: COLORS.WARNING, ...extra });
}

/** Niebieski embed informacyjny. */
function info(title, description, extra = {}) {
  return base({ title, description, color: COLORS.INFO, ...extra });
}

/** Złoty embed panelu / marki uczelni. */
function panel(title, description, extra = {}) {
  return base({ title, description, color: COLORS.BRASS, ...extra });
}

/** Embed "ładowania" — do edycji po zakończeniu wolnej operacji. */
function loading(text = "Przetwarzanie…") {
  return base({ title: "⏳ Chwileczkę", description: text, color: COLORS.BRASS });
}

/** Standardowy embed braku uprawnień. */
function noPermission(detail) {
  return error(
    "Brak uprawnień",
    detail || "Nie masz uprawnień do użycia tej komendy. Jeśli to pomyłka, zgłoś się do administracji."
  );
}

/**
 * Tekstowy pasek postępu, np. `progressBar(7, 10)` → "▰▰▰▰▰▰▰▱▱▱ 70%".
 * @param {number} current
 * @param {number} total
 * @param {number} length liczba segmentów
 */
function progressBar(current, total, length = 10) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(1, Math.max(0, current / safeTotal));
  const filled = Math.round(ratio * length);
  const bar = "▰".repeat(filled) + "▱".repeat(Math.max(0, length - filled));
  return `${bar} ${Math.round(ratio * 100)}%`;
}

/**
 * Bezpieczna odpowiedź na interakcję (reply albo editReply po deferze).
 * @param {import("discord.js").Interaction} interaction
 * @param {object} payload
 */
async function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => null);
  }
  // Modal-submit i selecty też to obsłużą; showModal-owe flow nie trafiają tutaj.
  if (interaction.isModalSubmit?.() && !interaction.deferred && !interaction.replied) {
    return interaction.reply(payload).catch(() => null);
  }
  return interaction.reply(payload).catch(() => null);
}

/** Szybka efemeryczna odpowiedź-błąd jako embed. */
async function replyError(interaction, message, title = "Coś poszło nie tak") {
  return safeReply(interaction, { embeds: [error(title, message)], ephemeral: true });
}

/** Szybka efemeryczna odpowiedź-sukces jako embed. */
async function replySuccess(interaction, message, title = "Gotowe") {
  return safeReply(interaction, { embeds: [success(title, message)], ephemeral: true });
}

module.exports = {
  COLORS,
  BRAND_FOOTER,
  DIVIDER,
  base,
  success,
  error,
  warning,
  info,
  panel,
  loading,
  noPermission,
  progressBar,
  safeReply,
  replyError,
  replySuccess,
};
