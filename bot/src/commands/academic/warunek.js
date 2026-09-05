const { SlashCommandBuilder } = require("discord.js");
const retakeService = require("../../services/retakeService");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warunek")
    .setDescription("⚠️ | Zaliczenia warunkowe")
    .addSubcommand((s) =>
      s
        .setName("zglos")
        .setDescription("Zgłasza powtarzanie przedmiotu i pobiera opłatę IC")
        .addUserOption((o) => o.setName("student").setDescription("Student").setRequired(true))
        .addStringOption((o) => o.setName("przedmiot").setDescription("Nazwa przedmiotu").setRequired(true))
        .addIntegerOption((o) => o.setName("oplata").setDescription("Opłata IC (domyślnie 300)").setRequired(false))
    ),

  async execute(interaction) {
    if (!(await hasPermission(interaction.member, "MANAGE_GRADES"))) {
      return interaction.reply({ content: "❌ Brak uprawnień (wymagany Dziekanat/Administrator USOS).", ephemeral: true });
    }

    const student = interaction.options.getUser("student");
    const przedmiot = interaction.options.getString("przedmiot");
    const oplata = interaction.options.getInteger("oplata") ?? undefined;

    try {
      const retake = await retakeService.reportRetake(student.id, przedmiot, oplata);
      return interaction.reply(
        `📋 Zgłoszono warunek z **${przedmiot}** dla <@${student.id}>. Pobrano opłatę: ${retake.feeIC} IC.`
      );
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },
};
