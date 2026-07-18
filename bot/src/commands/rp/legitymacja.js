/**
 * commands/rp/legitymacja.js
 * /legitymacja — generuje wizualną legitymację studencką (Canvas)
 * z wydziałem, nr albumu i kodem kreskowym (uproszczony, wizualny).
 */

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas } = require("@napi-rs/canvas");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("legitymacja")
    .setDescription("Generuje Twoją legitymację studencką"),

  async execute(interaction) {
    const character = await prisma.character.findUnique({
      where: { userId: interaction.user.id },
      include: { faculty: true },
    });

    if (!character) {
      return interaction.reply({ content: "Nie masz jeszcze postaci. Przejdź weryfikację.", ephemeral: true });
    }

    const buffer = this._renderCard(character, interaction.user.username);
    const attachment = new AttachmentBuilder(buffer, { name: "legitymacja.png" });

    await interaction.reply({ files: [attachment] });
  },

  _renderCard(character, discordUsername) {
    const width = 640;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // tło - gradient uczelniany
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#1a2a6c");
    gradient.addColorStop(1, "#8a1538");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // panel danych
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillRect(24, 90, width - 48, height - 180);

    ctx.fillStyle = "#111";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("UNIWERSYTET WARSZAWSKI RP", 24, 50);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#ddd";
    ctx.fillText("Legitymacja studencka", 24, 74);

    ctx.fillStyle = "#111";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`${character.firstNameIC} ${character.lastNameIC}`, 48, 140);

    ctx.font = "16px sans-serif";
    const lines = [
      `Wydział: ${character.faculty?.name ?? "Nieprzypisany"}`,
      `Nr albumu: ${character.albumNumber}`,
      `Rok studiów: ${character.yearOfStudy ?? "—"}`,
      `Konto Discord: @${discordUsername}`,
    ];
    lines.forEach((line, i) => ctx.fillText(line, 48, 180 + i * 28));

    // uproszczony kod kreskowy - pionowe paski o pseudolosowej szerokości z seed = albumNumber
    let seed = character.albumNumber.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const barX = 48;
    const barY = height - 70;
    let x = barX;
    while (x < width - 48) {
      seed = (seed * 9301 + 49297) % 233280;
      const w = 2 + (seed % 5);
      ctx.fillStyle = "#111";
      ctx.fillRect(x, barY, w, 40);
      x += w + 2;
    }

    return canvas.toBuffer("image/png");
  },
};
