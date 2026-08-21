/**
 * commands/academic/ects.js
 * Mechanika 4: Punkty ECTS.
 * Sumuje ECTS przedmiotów, z których student ma ocenę zaliczającą (>=3.0),
 * i porównuje z wymaganą pulą na rok (domyślnie 30 ECTS/rok — zgodnie
 * z rzeczywistym standardem — edytowalne parametrem).
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");

const PASSING_GRADE = 3.0;
const DEFAULT_REQUIRED_PER_YEAR = 30;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ects")
    .setDescription("🎓 Sprawdza zebraną pulę punktów ECTS")
    .addIntegerOption((o) => o.setName("wymagane").setDescription("Wymagana pula na rok (domyślnie 30)").setRequired(false)),

  async execute(interaction) {
    const required = interaction.options.getInteger("wymagane") ?? DEFAULT_REQUIRED_PER_YEAR;

    const grades = await prisma.grade.findMany({
      where: { userId: interaction.user.id, value: { gte: PASSING_GRADE } },
      include: { subject: true },
    });

    // liczymy każdy przedmiot raz (najlepsza ocena, jeśli zaliczany kilkukrotnie)
    const bySubject = new Map();
    for (const g of grades) {
      if (!bySubject.has(g.subjectId) || bySubject.get(g.subjectId).value < g.value) {
        bySubject.set(g.subjectId, g);
      }
    }

    const collected = Array.from(bySubject.values()).reduce((sum, g) => sum + g.subject.ectsPoints, 0);
    const percent = Math.min(100, Math.round((collected / required) * 100));

    const embed = new EmbedBuilder()
      .setTitle("📊 Punkty ECTS")
      .addFields(
        { name: "Zebrane", value: `${collected} ECTS`, inline: true },
        { name: "Wymagane (rok)", value: `${required} ECTS`, inline: true },
        { name: "Postęp", value: `${percent}%`, inline: true }
      )
      .setColor(collected >= required ? 0x2ecc71 : 0xe67e22);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
