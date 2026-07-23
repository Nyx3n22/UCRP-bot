/**
 * commands/rp/captcha.js
 * Drugi krok weryfikacji: użytkownik wpisuje kod z obrazka wysłanego
 * przez verificationService.handleModalSubmit(). Bez tej komendy cały
 * flow weryfikacji (modal -> captcha -> Roblox -> rola) nie mógł się dokończyć.
 */

const { SlashCommandBuilder } = require("discord.js");
const verificationService = require("../../services/verificationService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("captcha")
    .setDescription("Wpisz kod z obrazka, żeby dokończyć weryfikację")
    .addStringOption((o) => o.setName("kod").setDescription("Kod z obrazka").setRequired(true)),

  async execute(interaction) {
    const kod = interaction.options.getString("kod");
    await verificationService.handleCaptchaSubmit(interaction, kod);
  },
};
