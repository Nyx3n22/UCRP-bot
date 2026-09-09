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
const { logError } = require("../../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("egzamin")
    .setDescription("📝 | Zarządzanie egzaminami (kadra akademicka)")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Rozpoczyna egzamin DM dla studentów danego wydziału")
        .addStringOption((o) => o.setName("przedmiot").setDescription("Nazwa przedmiotu").setRequired(true))
        .addStringOption((o) => o.setName("temat").setDescription("Temat egzaminu").setRequired(true))
    ),

  async execute(interaction) {
    const member = interaction.member;

    // UWAGA: hasPermission jest asynchroniczne - bez await warunek nigdy
    // by nie zadziałał (Promise jest zawsze truthy) i każdy mógłby
    // uruchomić egzamin.
    if (!(await hasPermission(member, "MANAGE_EXAMS"))) {
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

      // UWAGA: startExam trwa godzinami (czeka na odpowiedzi studentów),
      // więc NIE czekamy na jego zakończenie - potwierdzamy start przez
      // callback onStarted, a sam egzamin leci w tle. await tutaj
      // oznaczałby wygaśnięcie tokenu interakcji i brak potwierdzenia.
      let startConfirmed = false;
      examService
        .startExam(
          interaction.client,
          {
            subjectName,
            topic,
            facultyChannelId: interaction.channelId,
            resultsChannelId,
            startedById: interaction.user.id,
            guild: interaction.guild,
          },
          async ({ studentCount }) => {
            startConfirmed = true;
            await interaction.editReply(
              `✅ Egzamin z **${subjectName}** rozpoczęty. Wysłano zaproszenia DM do ${studentCount} studentów. Wyniki pojawią się na kanale wyników po zakończeniu.`
            );
          }
        )
        .catch(async (bgErr) => {
          await logError("egzamin", "EXAM_BG_ERROR", bgErr.message, { subjectName, stack: bgErr.stack });
          // Tylko błędy sprzed potwierdzenia (np. brak przedmiotu) pokazujemy
          // prowadzącemu - późniejsze nie mogą nadpisać sukcesu (i token
          // interakcji i tak już wtedy nie żyje).
          if (!startConfirmed) {
            await interaction.editReply(`❌ Błąd: ${bgErr.message}`).catch(() => null);
          }
        });
    } catch (err) {
      await interaction.editReply(`❌ Błąd: ${err.message}`);
    }
  },
};
