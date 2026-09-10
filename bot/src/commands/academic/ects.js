/**
 * commands/academic/ects.js
 * Mechanika 4: Punkty ECTS.
 * Sumuje ECTS przedmiotów, z których student ma ocenę zaliczającą (>=3.0),
 * i porównuje z wymaganą pulą na rok (domyślnie 30 ECTS/rok — zgodnie
 * z rzeczywistym standardem — edytowalne parametrem).
 */

const { SlashCommandBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");
const ui = require("../../utils/embeds");

const PASSING_GRADE = 3.0;
const DEFAULT_REQUIRED_PER_YEAR = 30;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ects")
    .setDescription("🎓 | Sprawdza zebraną pulę punktów ECTS")
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
    const done = collected >= required;
    const bar = ui.progressBar(collected, required, 12);

    const embed = ui.base({
      title: "📊 Punkty ECTS",
      description: `${bar}\n\n${done ? "🎉 **Wymagana pula zebrana!**" : `Brakuje jeszcze **${required - collected} ECTS**.`}`,
      color: done ? ui.COLORS.SUCCESS : ui.COLORS.GOLD,
      thumbnail: interaction.user.displayAvatarURL(),
      fields: [
        { name: "Zebrane", value: `**${collected}** ECTS`, inline: true },
        { name: "Wymagane (rok)", value: `**${required}** ECTS`, inline: true },
        { name: "Zaliczone przedmioty", value: `${bySubject.size}`, inline: true },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
