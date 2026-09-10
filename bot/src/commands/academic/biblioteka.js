const { SlashCommandBuilder } = require("discord.js");
const libraryService = require("../../services/libraryService");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("biblioteka")
    .setDescription("📚 | Biblioteka Akademicka")
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
        const embed = ui.success(
          "Wypożyczono zasób",
          `📗 **${title}**\n\n⏳ Termin zwrotu: **${loan.dueAt.toLocaleDateString("pl-PL")}**`
        );
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "oddaj") {
        await libraryService.return_(interaction.user.id, title);
        const embed = ui.success("Zwrócono zasób", `📘 **${title}**\n\nDziękujemy za terminowy zwrot!`);
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "moje") {
        const loans = await libraryService.myLoans(interaction.user.id);
        if (loans.length === 0) {
          return interaction.reply({
            embeds: [ui.info("📚 Twoje wypożyczenia", "Nie masz aktywnych wypożyczeń.\n\nUżyj `/biblioteka wypozycz`, aby wypożyczyć zasób.")],
            ephemeral: true,
          });
        }
        const embed = ui
          .base({
            title: "📚 Twoje wypożyczenia",
            description: loans
              .map((l) => `📖 **${l.resource.title}**\n└ do **${l.dueAt.toLocaleDateString("pl-PL")}**`)
              .join("\n\n"),
            color: ui.COLORS.INFO,
            thumbnail: interaction.user.displayAvatarURL(),
          })
          .addFields({ name: "Aktywne wypożyczenia", value: `${loans.length}`, inline: true });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (err) {
      return ui.replyError(interaction, err.message, "Biblioteka");
    }
  },
};
