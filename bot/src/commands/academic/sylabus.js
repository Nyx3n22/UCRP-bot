/**
 * commands/academic/sylabus.js
 * /sylabus [przedmiot] — studenci sprawdzają zakres materiału wpisany
 * w Dashboardzie przez administrację/wykładowców.
 */

const { SlashCommandBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sylabus")
    .setDescription("📖 | Wyświetla podstawę programową przedmiotu")
    .addStringOption((o) => o.setName("przedmiot").setDescription("Nazwa przedmiotu").setRequired(true)),

  async execute(interaction) {
    const subjectName = interaction.options.getString("przedmiot");

    const subject = await prisma.subject.findFirst({
      where: { name: { equals: subjectName, mode: "insensitive" } },
      include: { syllabus: true, faculty: true },
    });

    if (!subject) {
      return interaction.reply({
        embeds: [ui.warning("Nie znaleziono przedmiotu", `Na uczelni nie ma przedmiotu **${subjectName}**. Sprawdź pisownię i spróbuj ponownie.`)],
        ephemeral: true,
      });
    }
    if (!subject.syllabus) {
      return interaction.reply({
        embeds: [ui.info("📚 Sylabus w przygotowaniu", `Sylabus dla **${subject.name}** nie został jeszcze uzupełniony.\n\nWykładowca doda go wkrótce w Dashboardzie.`)],
        ephemeral: true,
      });
    }

    const embed = ui.base({
      title: `📚 Sylabus — ${subject.name}`,
      description: subject.syllabus.content.slice(0, 3800),
      color: ui.COLORS.INFO,
      fields: [
        { name: "🏛️ Wydział", value: subject.faculty?.name ?? "—", inline: true },
        { name: "🎓 Punkty ECTS", value: `**${subject.ectsPoints}**`, inline: true },
        { name: "🕓 Aktualizacja", value: subject.syllabus.updatedAt.toLocaleDateString("pl-PL"), inline: true },
      ],
    });

    await interaction.reply({ embeds: [embed] });
  },
};
