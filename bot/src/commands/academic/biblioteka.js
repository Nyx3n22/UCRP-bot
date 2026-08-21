const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const libraryService = require("../../services/libraryService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("biblioteka")
    .setDescription("📚 Biblioteka Akademicka")
    .addSubcommand((s) =>
      s
        .setName("wypozycz")
        .setDescription("Wypożycza zasób")
        .addStringOption((o) => o.setName("tytul").setDescription("Tytuł zasobu").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("oddaj")
        .setDescription("Zwraca zasób")
        .addStringOption((o) => o.setName("tytul").setDescription("Tytuł zasobu").setRequired(true))
    )
    .addSubcommand((s) => s.setName("moje").setDescription("Twoje aktywne wypożyczenia")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const title = interaction.options.getString("tytul");

    try {
      if (sub === "wypozycz") {
        const loan = await libraryService.borrow(interaction.user.id, title);
        return interaction.reply(
          `📗 Wypożyczono **${title}**. Termin zwrotu: ${loan.dueAt.toLocaleDateString("pl-PL")}.`
        );
      }

      if (sub === "oddaj") {
        await libraryService.return_(interaction.user.id, title);
        return interaction.reply(`📘 Zwrócono **${title}**. Dziękujemy!`);
      }

      if (sub === "moje") {
        const loans = await libraryService.myLoans(interaction.user.id);
        if (loans.length === 0) {
          return interaction.reply({ content: "Nie masz aktywnych wypożyczeń.", ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setTitle("📚 Twoje wypożyczenia")
          .setDescription(
            loans.map((l) => `**${l.resource.title}** — do ${l.dueAt.toLocaleDateString("pl-PL")}`).join("\n")
          )
          .setColor(0x2a52be);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },
};
