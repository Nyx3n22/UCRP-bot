/**
 * commands/admin/dziekanat.js
 * Mechanika 14: Generator Dziekanatu.
 * /dziekanat ogloszenie otwiera Modal (tytuł, treść, wydział), a po
 * zatwierdzeniu bot generuje sformatowany, oficjalny embed na kanale ogłoszeń.
 * Modal jest obsługiwany w interactionCreate.js (customId: "dziekanat_modal").
 */

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dziekanat")
    .setDescription("🏛️ Narzędzia Dziekanatu")
    .addSubcommand((s) => s.setName("ogloszenie").setDescription("Otwiera kreator oficjalnego ogłoszenia")),

  async execute(interaction) {
    if (!(await hasPermission(interaction.member, "MANAGE_DEANERY"))) {
      return interaction.reply({ content: "❌ Brak uprawnień (wymagany Dziekanat/Władze Uczelni).", ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId("dziekanat_modal").setTitle("Ogłoszenie Dziekanatu");

    const tytul = new TextInputBuilder()
      .setCustomId("tytul")
      .setLabel("Tytuł ogłoszenia")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const wydzial = new TextInputBuilder()
      .setCustomId("wydzial")
      .setLabel("Wydział (lub 'Ogólnouczelniane')")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const tresc = new TextInputBuilder()
      .setCustomId("tresc")
      .setLabel("Treść ogłoszenia")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(tytul),
      new ActionRowBuilder().addComponents(wydzial),
      new ActionRowBuilder().addComponents(tresc)
    );

    await interaction.showModal(modal);
  },
};
