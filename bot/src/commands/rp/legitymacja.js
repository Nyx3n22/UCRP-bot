/**
 * commands/rp/legitymacja.js
 * /legitymacja — generuje wizualną legitymację studencką (Canvas), ze
 * zdjęciem (awatar Discord), w layoucie przypominającym prawdziwą kartę ID.
 * Tylko dla faktycznych studentów (character.yearOfStudy ustawione) - dla
 * kadry/administracji "legitymacja studencka" nie ma sensu.
 */

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("legitymacja")
    .setDescription("🪪 Generuje Twoją legitymację studencką"),

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

    await interaction.deferReply();

    const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 256 });
    const buffer = await this._renderCard(character, avatarUrl);
    const attachment = new AttachmentBuilder(buffer, { name: "legitymacja.png" });

    await interaction.editReply({ files: [attachment] });
  },

  async _renderCard(character, avatarUrl) {
    const width = 700;
    const height = 440;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- tło karty: kremowy/pergaminowy, jak prawdziwa legitymacja ---
    ctx.fillStyle = "#f2ede1";
    ctx.fillRect(0, 0, width, height);

    // --- górny pasek nagłówkowy (granat, jak reszta brandingu) ---
    const headerHeight = 76;
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, "#12141c");
    headerGradient.addColorStop(1, "#1a2a6c");
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, width, headerHeight);

    ctx.fillStyle = "#c9a15a";
    ctx.font = "bold 24px serif";
    ctx.fillText("UNIWERSYTET CENTRALNY RP", 24, 34);
    ctx.fillStyle = "#efe8d8";
    ctx.font = "14px sans-serif";
    ctx.fillText("LEGITYMACJA STUDENCKA", 24, 58);

    // cienka linia oddzielająca nagłówek od reszty
    ctx.strokeStyle = "#c9a15a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();

    // --- ramka na zdjęcie (lewa strona) ---
    const photoX = 32;
    const photoY = headerHeight + 28;
    const photoSize = 150;

    ctx.strokeStyle = "#12141c";
    ctx.lineWidth = 3;
    ctx.strokeRect(photoX - 3, photoY - 3, photoSize + 6, photoSize + 6);

    try {
      const avatarImage = await loadImage(avatarUrl);
      ctx.drawImage(avatarImage, photoX, photoY, photoSize, photoSize);
    } catch {
      // fallback jeśli pobranie awatara się nie uda - szary kwadrat zamiast crasha
      ctx.fillStyle = "#ccc";
      ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }

    // --- dane studenta (prawa strona, obok zdjęcia) ---
    const textX = photoX + photoSize + 32;
    let textY = photoY + 10;

    ctx.fillStyle = "#12141c";
    ctx.font = "bold 24px serif";
    ctx.fillText(`${character.firstNameIC} ${character.lastNameIC}`, textX, textY);
    textY += 34;

    const fields = [
      ["Wydział", character.faculty?.name ?? "Nieprzypisany"],
      ["Rok studiów", `${character.yearOfStudy}`],
      ["Nr albumu", character.albumNumber],
      ["Ważna do", "30.09.2027"],
    ];

    ctx.font = "13px sans-serif";
    for (const [label, value] of fields) {
      ctx.fillStyle = "#7a1f3d";
      ctx.font = "11px sans-serif";
      ctx.fillText(label.toUpperCase(), textX, textY);
      ctx.fillStyle = "#12141c";
      ctx.font = "16px sans-serif";
      ctx.fillText(value, textX, textY + 18);
      textY += 42;
    }

    // --- pasek podpisu / stopka karty ---
    ctx.strokeStyle = "#12141c33";
    ctx.beginPath();
    ctx.moveTo(32, height - 90);
    ctx.lineTo(width - 32, height - 90);
    ctx.stroke();

    ctx.fillStyle = "#12141c88";
    ctx.font = "italic 11px sans-serif";
    ctx.fillText("Dokument elektroniczny wygenerowany automatycznie - nieważny bez ważnej weryfikacji na serwerze.", 32, height - 72);

    // --- kod kreskowy na dole, oparty o numer albumu (deterministyczny, nie losowy przy każdej generacji) ---
    let seed = character.albumNumber.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const barY = height - 52;
    const barHeight = 32;
    let x = 32;
    while (x < width - 32) {
      seed = (seed * 9301 + 49297) % 233280;
      const w = 2 + (seed % 4);
      ctx.fillStyle = "#12141c";
      ctx.fillRect(x, barY, w, barHeight);
      x += w + 2;
    }
    ctx.font = "10px monospace";
    ctx.fillStyle = "#12141c";
    ctx.fillText(character.albumNumber, 32, height - 14);

    return canvas.toBuffer("image/png");
  },
};
