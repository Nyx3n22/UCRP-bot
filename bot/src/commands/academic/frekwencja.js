const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const attendanceService = require("../../services/attendanceService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("frekwencja")
    .setDescription("📊 Sprawdza Twoją frekwencję na salach wykładowych")
    .addIntegerOption((o) => o.setName("dni").setDescription("Zakres w dniach (domyślnie 30)").setRequired(false)),

  async execute(interaction) {
    const dni = interaction.options.getInteger("dni") ?? 30;
    const report = await attendanceService.report(interaction.user.id, dni);

    const embed = new EmbedBuilder()
      .setTitle("🎙️ Frekwencja")
      .addFields(
        { name: "Okres", value: `${dni} dni`, inline: true },
        { name: "Łączny czas", value: `${report.totalMinutes} min`, inline: true },
        { name: "Liczba sesji", value: `${report.sessions}`, inline: true }
      )
      .setColor(0x2a52be);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
