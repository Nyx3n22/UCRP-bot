const { SlashCommandBuilder } = require("discord.js");
const retakeService = require("../../services/retakeService");
const { hasPermission } = require("../../config/roles");
const ui = require("../../utils/embeds");

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
      return interaction.reply({
        embeds: [ui.noPermission("Zgłaszanie warunku wymaga roli Dziekanatu / Administratora USOS (**MANAGE_GRADES**).")],
        ephemeral: true,
      });
    }

    const student = interaction.options.getUser("student");
    const przedmiot = interaction.options.getString("przedmiot");
    const oplata = interaction.options.getInteger("oplata") ?? undefined;

    try {
      const retake = await retakeService.reportRetake(student.id, przedmiot, oplata);
      const embed = ui.warning(
        "Zgłoszono warunek",
        `📋 **${przedmiot}**\n\n👤 Student: <@${student.id}>\n💰 Pobrano opłatę: **${retake.feeIC} IC**`
      );
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      return ui.replyError(interaction, err.message, "Warunek");
    }
  },
};
