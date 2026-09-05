const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const scholarshipService = require("../../services/scholarshipService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stypendium")
    .setDescription("💰 | Sprawdza Twoją historię stypendiów")
    .addSubcommand((s) => s.setName("historia").setDescription("Twoja historia stypendiów")),

  async execute(interaction) {
    const history = await scholarshipService.history(interaction.user.id);
    if (history.length === 0) return interaction.reply({ content: "Nie otrzymałeś jeszcze stypendium.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("🎓 Historia stypendiów")
      .setDescription(
        history.map((h) => `${h.issuedAt.toLocaleDateString("pl-PL")} — ${h.amountIC} IC (GPA ${h.gpaAtIssue.toFixed(2)})`).join("\n")
      )
      .setColor(0x8a1538);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
