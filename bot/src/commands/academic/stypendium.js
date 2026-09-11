const { SlashCommandBuilder } = require("discord.js");
const scholarshipService = require("../../services/scholarshipService");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stypendium")
    .setDescription("💰 | Sprawdza Twoją historię stypendiów")
    .addSubcommand((s) => s.setName("historia").setDescription("🗂️ | Twoja historia stypendiów")),

  async execute(interaction) {
    const history = await scholarshipService.history(interaction.user.id);
    if (history.length === 0) {
      return interaction.reply({
        embeds: [ui.info("🎓 Historia stypendiów", "Nie otrzymałeś jeszcze stypendium.\n\nStypendia przyznawane są za wysoką średnią ocen (GPA).")],
        ephemeral: true,
      });
    }

    const total = history.reduce((sum, h) => sum + h.amountIC, 0);
    const embed = ui.base({
      title: "🎓 Historia stypendiów",
      description: history
        .map((h) => `💰 **${h.amountIC} IC** — GPA **${h.gpaAtIssue.toFixed(2)}**\n└ ${h.issuedAt.toLocaleDateString("pl-PL")}`)
        .join("\n\n"),
      color: ui.COLORS.GOLD,
      thumbnail: interaction.user.displayAvatarURL(),
      fields: [
        { name: "Wypłaty", value: `${history.length}`, inline: true },
        { name: "Łącznie", value: `**${total} IC**`, inline: true },
      ],
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
