const { SlashCommandBuilder } = require("discord.js");
const attendanceService = require("../../services/attendanceService");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("frekwencja")
    .setDescription("📊 | Sprawdza Twoją frekwencję na salach wykładowych")
    .addIntegerOption((o) => o.setName("dni").setDescription("Zakres w dniach (domyślnie 30)").setRequired(false)),

  async execute(interaction) {
    const dni = interaction.options.getInteger("dni") ?? 30;
    const report = await attendanceService.report(interaction.user.id, dni);

    const hours = Math.floor(report.totalMinutes / 60);
    const minutes = report.totalMinutes % 60;
    const timeStr = hours > 0 ? `${hours} godz. ${minutes} min` : `${minutes} min`;

    const embed = ui.base({
      title: "🎙️ Frekwencja",
      description: `Aktywność na salach wykładowych z ostatnich **${dni} dni**.`,
      color: ui.COLORS.INFO,
      thumbnail: interaction.user.displayAvatarURL(),
      fields: [
        { name: "⏱️ Łączny czas", value: `**${timeStr}**`, inline: true },
        { name: "🔢 Liczba sesji", value: `**${report.sessions}**`, inline: true },
        {
          name: "📈 Średnio na sesję",
          value: report.sessions > 0 ? `**${Math.round(report.totalMinutes / report.sessions)} min**` : "—",
          inline: true,
        },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
