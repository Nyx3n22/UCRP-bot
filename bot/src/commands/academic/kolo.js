const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const circleService = require("../../services/circleService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kolo")
    .setDescription("Koła Naukowe")
    .addSubcommand((s) =>
      s.setName("utworz").setDescription("Zakłada nowe koło naukowe")
        .addStringOption((o) => o.setName("nazwa").setDescription("Nazwa koła").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("dolacz").setDescription("Dołącza do koła")
        .addStringOption((o) => o.setName("nazwa").setDescription("Nazwa koła").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("opusc").setDescription("Opuszcza koło")
        .addStringOption((o) => o.setName("nazwa").setDescription("Nazwa koła").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("budzet")
        .setDescription("Zmienia budżet koła (tylko lider)")
        .addStringOption((o) => o.setName("nazwa").setDescription("Nazwa koła").setRequired(true))
        .addIntegerOption((o) => o.setName("kwota").setDescription("Wartość +/- IC").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Pokazuje status koła")
        .addStringOption((o) => o.setName("nazwa").setDescription("Nazwa koła").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const nazwa = interaction.options.getString("nazwa");

    try {
      if (sub === "utworz") {
        await circleService.create(nazwa, interaction.user.id);
        return interaction.reply(`🔬 Koło naukowe **${nazwa}** założone. Liderem zostajesz Ty.`);
      }
      if (sub === "dolacz") {
        await circleService.join(nazwa, interaction.user.id);
        return interaction.reply(`✅ Dołączono do koła **${nazwa}**.`);
      }
      if (sub === "opusc") {
        await circleService.leave(nazwa, interaction.user.id);
        return interaction.reply(`👋 Opuszczono koło **${nazwa}**.`);
      }
      if (sub === "budzet") {
        const kwota = interaction.options.getInteger("kwota");
        const circle = await circleService.adjustBudget(nazwa, kwota, interaction.user.id);
        return interaction.reply(`💰 Nowy budżet koła **${nazwa}**: ${circle.budgetIC} IC.`);
      }
      if (sub === "status") {
        const circle = await circleService.status(nazwa);
        if (!circle) return interaction.reply({ content: `Nie znaleziono koła "${nazwa}".`, ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle(`🔬 ${circle.name}`)
          .addFields(
            { name: "Lider", value: `<@${circle.leaderId}>`, inline: true },
            { name: "Budżet", value: `${circle.budgetIC} IC`, inline: true },
            { name: "Członkowie", value: `${circle.members.length}`, inline: true }
          )
          .setColor(0x8a1538);
        return interaction.reply({ embeds: [embed] });
      }
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },
};
