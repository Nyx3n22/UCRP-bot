/**
 * commands/rp/partnerstwo.js
 * /partnerstwo zglos - otwiera Modal z opisem propozycji współpracy,
 * tworzy prywatny ticket (kategoria PARTNERSTWO), AI generuje uporządkowane
 * podsumowanie zgłoszenia, a rola PARTNERSHIP_MANAGER dostaje powiadomienie.
 */

// UWAGA: submit modala obsługuje partnerstwoService.handleModalSubmit (routing
// w interactionCreate.js) - ta komenda tylko WYŚWIETLA modal.
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnerstwo")
    .setDescription("🤝 Partnerstwa i współprace")
    .addSubcommand((s) => s.setName("zglos").setDescription("📬 | Zgłasza propozycję partnerstwa")),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("partnerstwo_modal")
      .setTitle("Zgłoszenie partnerstwa")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("nazwa").setLabel("Nazwa serwera/marki").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("kontakt").setLabel("Kontakt (Discord/e-mail)").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("opis")
            .setLabel("Opis propozycji współpracy")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
  },
};
