const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const dormitoryService = require("../../services/dormitoryService");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("akademik")
    .setDescription("🏠 Akademiki")
    .addSubcommand((s) =>
      s
        .setName("zamieszkaj")
        .setDescription("Melduje Cię w pokoju akademika")
        .addStringOption((o) => o.setName("pokoj").setDescription("Numer pokoju").setRequired(true))
    )
    .addSubcommand((s) => s.setName("wymelduj").setDescription("Wymeldowuje Cię z akademika"))
    .addSubcommand((s) => s.setName("moj_pokoj").setDescription("Pokazuje Twój pokój"))
    .addSubcommand((s) =>
      s
        .setName("pobierz_czynsz")
        .setDescription("Pobiera czynsz od mieszkańców pokoju (Dziekanat)")
        .addStringOption((o) => o.setName("pokoj").setDescription("Numer pokoju").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "zamieszkaj") {
        const pokoj = interaction.options.getString("pokoj");
        await dormitoryService.moveIn(pokoj, interaction.user.id);
        return interaction.reply(`🏠 Zamieszkałeś w pokoju **${pokoj}**.`);
      }

      if (sub === "wymelduj") {
        await dormitoryService.moveOut(interaction.user.id);
        return interaction.reply("📤 Wymeldowano z akademika.");
      }

      if (sub === "moj_pokoj") {
        const room = await dormitoryService.myRoom(interaction.user.id);
        if (!room) return interaction.reply({ content: "Nie mieszkasz obecnie w akademiku.", ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle(`🏠 Pokój ${room.roomNumber}`)
          .addFields({ name: "Czynsz", value: `${room.rentIC} IC`, inline: true })
          .setColor(0x2a52be);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === "pobierz_czynsz") {
        if (!(await hasPermission(interaction.member, "MANAGE_DEANERY"))) {
          return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
        }
        const pokoj = interaction.options.getString("pokoj");
        const results = await dormitoryService.collectRent(pokoj);
        const summary = results
          .map((r) => `<@${r.userId}>: ${r.paid ? `zapłacono ${r.amount} IC` : "brak środków"}`)
          .join("\n");
        return interaction.reply(`💸 Pobór czynszu — pokój ${pokoj}:\n${summary}`);
      }
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },
};
