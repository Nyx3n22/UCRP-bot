/**
 * commands/academic/egzamin.js
 *
 * /egzamin start [przedmiot] [temat] — tylko dla ról z uprawnieniem MANAGE_EXAMS
 * na wydziale, do którego przypisany jest dany przedmiot.
 */

const { SlashCommandBuilder } = require("discord.js");
const examService = require("../../services/examService");
const { hasPermission } = require("../../config/roles");
const { getBoundChannelId } = require("../../config/channels");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("egzamin")
    .setDescription("Zarządzanie egzaminami (kadra akademicka)")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Rozpoczyna egzamin DM dla studentów danego wydziału")
        .addStringOption((o) => o.setName("przedmiot").setDescription("Nazwa przedmiotu").setRequired(true))
        .addStringOption((o) => o.setName("temat").setDescription("Temat egzaminu").setRequired(true))
    ),

  async execute(interaction) {
    const member = interaction.member;

    if (!hasPermission(member, "MANAGE_EXAMS")) {
      return interaction.reply({
        content: "❌ Nie masz uprawnień do prowadzenia egzaminów.",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== "start") return;

    const subjectName = interaction.options.getString("przedmiot");
    const topic = interaction.options.getString("temat");

    await interaction.deferReply({ ephemeral: true });

    try {
      const resultsChannelId = await getBoundChannelId("EXAM_RESULTS");

      const { notified } = await examService.startExam(interaction.client, {
        subjectName,
        topic,
        facultyChannelId: interaction.channelId,
        resultsChannelId,
        startedById: interaction.user.id,
        guild: interaction.guild,
      });

      await interaction.editReply(
        `✅ Egzamin z **${subjectName}** rozpoczęty. Wysłano zaproszenia DM do ${notified} studentów. Wyniki pojawią się na kanale wyników po zakończeniu.`
      );
    } catch (err) {
      await interaction.editReply(`❌ Błąd: ${err.message}`);
    }
  },
};
