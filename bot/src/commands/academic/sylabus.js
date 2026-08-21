/**
 * commands/academic/sylabus.js
 * /sylabus [przedmiot] — studenci sprawdzają zakres materiału wpisany
 * w Dashboardzie przez administrację/wykładowców.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sylabus")
    .setDescription("📖 Wyświetla podstawę programową przedmiotu")
    .addStringOption((o) => o.setName("przedmiot").setDescription("Nazwa przedmiotu").setRequired(true)),

  async execute(interaction) {
    const subjectName = interaction.options.getString("przedmiot");

    const subject = await prisma.subject.findFirst({
      where: { name: { equals: subjectName, mode: "insensitive" } },
      include: { syllabus: true, faculty: true },
    });

    if (!subject) {
      return interaction.reply({ content: `Nie znaleziono przedmiotu "${subjectName}".`, ephemeral: true });
    }
    if (!subject.syllabus) {
      return interaction.reply({
        content: `Sylabus dla "${subject.name}" nie został jeszcze uzupełniony w Dashboardzie.`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📚 Sylabus — ${subject.name}`)
      .setDescription(subject.syllabus.content.slice(0, 4000))
      .addFields(
        { name: "Wydział", value: subject.faculty?.name ?? "—", inline: true },
        { name: "Punkty ECTS", value: `${subject.ectsPoints}`, inline: true }
      )
      .setColor(0x2a52be)
      .setFooter({ text: `Ostatnia aktualizacja: ${subject.syllabus.updatedAt.toLocaleDateString("pl-PL")}` });

    await interaction.reply({ embeds: [embed] });
  },
};
