/**
 * commands/admin/dziekanat.js
 * Mechanika 14: Generator Dziekanatu.
 * /dziekanat ogloszenie otwiera Modal (tytuł, treść, wydział), a po
 * zatwierdzeniu bot generuje sformatowany, oficjalny embed na kanale ogłoszeń.
 * Modal jest obsługiwany w interactionCreate.js (customId: "dziekanat_modal").
 */

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { hasPermission } = require("../../config/roles");
const prisma = require("../../lib/prisma");
const { computeRenewedValidUntil, VALIDITY_DAYS } = require("../../utils/legitymacja");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dziekanat")
    .setDescription("🏛️ | Narzędzia Dziekanatu")
    .addSubcommand((s) => s.setName("ogloszenie").setDescription("Otwiera kreator oficjalnego ogłoszenia"))
    .addSubcommand((s) =>
      s
        .setName("legitymacja-przedluz")
        .setDescription(`Przedłuża ważność legitymacji studenckiej o ${VALIDITY_DAYS} dni`)
        .addUserOption((o) => o.setName("osoba").setDescription("Komu przedłużyć ważność").setRequired(true))
    ),

  async execute(interaction) {
    if (!(await hasPermission(interaction.member, "MANAGE_DEANERY"))) {
      return interaction.reply({ content: "❌ Brak uprawnień (wymagany Dziekanat/Władze Uczelni).", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "legitymacja-przedluz") {
      const target = interaction.options.getUser("osoba");
      const character = await prisma.character.findUnique({ where: { userId: target.id } });
      if (!character) {
        return interaction.reply({ content: "❌ Ta osoba nie ma jeszcze postaci.", ephemeral: true });
      }

      const newValidUntil = computeRenewedValidUntil();
      await prisma.character.update({ where: { userId: target.id }, data: { legitValidUntil: newValidUntil } });

      const embed = new EmbedBuilder()
        .setTitle("🪪 Legitymacja przedłużona")
        .setDescription(`Ważność legitymacji <@${target.id}> została przedłużona do **${newValidUntil.toLocaleDateString("pl-PL")}**.`)
        .setColor(0x1a2a6c);

      await target.send({ embeds: [embed] }).catch(() => null);
      return interaction.reply({ embeds: [embed] });
    }

    // sub === "ogloszenie"
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
