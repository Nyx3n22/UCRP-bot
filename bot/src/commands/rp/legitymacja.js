/**
 * commands/rp/legitymacja.js
 * /legitymacja — generuje wizualną legitymację studencką (Canvas).
 * Ważność jest TERAZ realnie egzekwowana (nie tylko wyświetlana): jeśli
 * legitValidUntil minęło, komenda odmawia wygenerowania karty i każe
 * zgłosić się do dziekanatu o przedłużenie (/dziekanat legitymacja-przedluz).
 */

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const prisma = require("../../lib/prisma");
const { isValid } = require("../../utils/legitymacja");

function formatDate(date) {
  return date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("legitymacja")
    .setDescription("🪪 | Generuje Twoją legitymację studencką"),

  async execute(interaction) {
    const character = await prisma.character.findUnique({
      where: { userId: interaction.user.id },
      include: { faculty: true },
    });

    if (!character) {
      return interaction.reply({ content: "Nie masz jeszcze postaci. Przejdź weryfikację.", ephemeral: true });
    }

    if (character.yearOfStudy === null || character.yearOfStudy === undefined) {
      return interaction.reply({
        content: "❌ Legitymacja studencka jest dostępna tylko dla studentów (Twoje konto nie ma przypisanego roku studiów).",
        ephemeral: true,
      });
    }

    if (!isValid(character.legitValidUntil)) {
      const dateStr = character.legitValidUntil ? formatDate(character.legitValidUntil) : "brak danych";
      return interaction.reply({
        content:
          `❌ Twoja legitymacja **straciła ważność** (wygasła: ${dateStr}). ` +
          "Zgłoś się do Dziekanatu o przedłużenie, zanim wygenerujesz nową kartę.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 256 });
    const buffer = await this._renderCard(character, avatarUrl);
    const attachment = new AttachmentBuilder(buffer, { name: "legitymacja.png" });

    await interaction.editReply({ files: [attachment] });
  },

  async _renderCard(character, avatarUrl) {
    const width = 760;
    const height = 480;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- karta z zaokrąglonymi rogami, tło typu "dokument zabezpieczony" ---
    roundedRectPath(ctx, 0, 0, width, height, 22);
    ctx.clip();

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, "#f4efe2");
    bgGradient.addColorStop(1, "#ece3cf");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // subtelny wzór giloszowy w tle (cienkie faliste linie, jak na prawdziwych dokumentach)
    ctx.strokeStyle = "rgba(26,42,108,0.05)";
    ctx.lineWidth = 1;
    for (let i = -height; i < width; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }

    // --- nagłówek ---
    const headerHeight = 86;
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, "#0d0f16");
    headerGradient.addColorStop(1, "#1a2a6c");
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, width, headerHeight);

    // emblemat (prosty herb-plakietka) w rogu nagłówka
    const sealX = width - 60;
    const sealY = headerHeight / 2;
    const sealGradient = ctx.createRadialGradient(sealX, sealY, 2, sealX, sealY, 26);
    sealGradient.addColorStop(0, "#e9cd8a");
    sealGradient.addColorStop(1, "#a9803c");
    ctx.fillStyle = sealGradient;
    ctx.beginPath();
    ctx.arc(sealX, sealY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0d0f16";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0d0f16";
    ctx.font = "bold 16px serif";
    ctx.textAlign = "center";
    ctx.fillText("UCRP", sealX, sealY + 6);
    ctx.textAlign = "left";

    ctx.fillStyle = "#d9b872";
    ctx.font = "bold 25px serif";
    ctx.fillText("UNIWERSYTET CENTRALNY RP", 26, 36);
    ctx.fillStyle = "#efe8d8";
    ctx.font = "13px sans-serif";
    ctx.fillText("ELEKTRONICZNA LEGITYMACJA STUDENCKA", 26, 60);
    ctx.font = "10px monospace";
    ctx.fillStyle = "#9aa3c9";
    ctx.fillText(`NR DOK. ${character.albumNumber.slice(0, 12).toUpperCase()}`, 26, 78);

    ctx.strokeStyle = "#d9b872";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();

    // --- zdjęcie (zaokrąglone rogi + delikatny cień) ---
    const photoX = 34;
    const photoY = headerHeight + 30;
    const photoSize = 170;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#0d0f16";
    roundedRectPath(ctx, photoX - 4, photoY - 4, photoSize + 8, photoSize + 8, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRectPath(ctx, photoX, photoY, photoSize, photoSize, 8);
    ctx.clip();
    try {
      const avatarImage = await loadImage(avatarUrl);
      ctx.drawImage(avatarImage, photoX, photoY, photoSize, photoSize);
    } catch {
      ctx.fillStyle = "#ccc";
      ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }
    ctx.restore();

    // "chip" karty pod zdjęciem, jak na prawdziwych dokumentach elektronicznych
    const chipY = photoY + photoSize + 16;
    const chipGradient = ctx.createLinearGradient(photoX, chipY, photoX + 46, chipY + 34);
    chipGradient.addColorStop(0, "#d9b872");
    chipGradient.addColorStop(1, "#a9803c");
    ctx.fillStyle = chipGradient;
    roundedRectPath(ctx, photoX, chipY, 46, 34, 5);
    ctx.fill();
    ctx.strokeStyle = "#7a1f3d33";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(photoX, chipY + (34 / 3) * i);
      ctx.lineTo(photoX + 46, chipY + (34 / 3) * i);
      ctx.stroke();
    }

    // --- dane studenta ---
    const textX = photoX + photoSize + 34;
    let textY = photoY + 14;

    ctx.fillStyle = "#12141c";
    ctx.font = "bold 26px serif";
    ctx.fillText(`${character.firstNameIC} ${character.lastNameIC}`, textX, textY);
    textY += 36;

    const fields = [
      ["Wydział", character.faculty?.name ?? "Nieprzypisany"],
      ["Rok studiów", `${character.yearOfStudy}`],
      ["Nr albumu", character.albumNumber],
      ["Ważna do", formatDate(character.legitValidUntil)],
    ];

    for (const [label, value] of fields) {
      ctx.fillStyle = "#7a1f3d";
      ctx.font = "11px sans-serif";
      ctx.fillText(label.toUpperCase(), textX, textY);
      ctx.fillStyle = "#12141c";
      ctx.font = "17px sans-serif";
      ctx.fillText(value, textX, textY + 19);
      textY += 44;
    }

    // --- stopka + kod kreskowy deterministyczny (na bazie nr albumu) ---
    ctx.strokeStyle = "#12141c33";
    ctx.beginPath();
    ctx.moveTo(34, height - 96);
    ctx.lineTo(width - 34, height - 96);
    ctx.stroke();

    ctx.fillStyle = "#12141c88";
    ctx.font = "italic 11px sans-serif";
    ctx.fillText("Dokument elektroniczny wygenerowany automatycznie - nieważny bez ważnej weryfikacji na serwerze.", 34, height - 78);

    let seed = character.albumNumber.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const barY = height - 58;
    const barHeight = 34;
    let x = 34;
    while (x < width - 34) {
      seed = (seed * 9301 + 49297) % 233280;
      const w = 2 + (seed % 4);
      ctx.fillStyle = "#12141c";
      ctx.fillRect(x, barY, w, barHeight);
      x += w + 2;
    }
    ctx.font = "10px monospace";
    ctx.fillStyle = "#12141c";
    ctx.fillText(character.albumNumber, 34, height - 16);

    return canvas.toBuffer("image/png");
  },
};
