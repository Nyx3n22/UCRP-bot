/**
 * commands/rp/partnerstwo.js
 * /partnerstwo zglos - otwiera Modal z opisem propozycji współpracy,
 * tworzy prywatny ticket (kategoria PARTNERSTWO), AI generuje uporządkowane
 * podsumowanie zgłoszenia, a rola PARTNERSHIP_MANAGER dostaje powiadomienie.
 */

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const ticketService = require("../../services/ticketService");
const { generateAiReply } = require("../../services/aiGatewayService");
const { getRoleIdForPermission } = require("../../config/roles");
const { getBoundChannelId } = require("../../config/channels");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnerstwo")
    .setDescription("Partnerstwa i współprace")
    .addSubcommand((s) => s.setName("zglos").setDescription("Zgłasza propozycję partnerstwa")),

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

  async handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const nazwa = interaction.fields.getTextInputValue("nazwa");
    const kontakt = interaction.fields.getTextInputValue("kontakt");
    const opis = interaction.fields.getTextInputValue("opis");

    const { channel } = await ticketService.openTicket(
      interaction.guild,
      interaction.member,
      "PARTNERSTWO",
      await getBoundChannelId("TICKET_CATEGORY_PARTNERSTWO")
    );

    const rawEmbed = new EmbedBuilder()
      .setTitle(`🤝 Zgłoszenie partnerstwa — ${nazwa}`)
      .addFields(
        { name: "Zgłaszający", value: `<@${interaction.user.id}>` },
        { name: "Kontakt", value: kontakt },
        { name: "Opis (oryginał)", value: opis.slice(0, 1024) }
      )
      .setColor(0xc9a15a);

    await channel.send({ embeds: [rawEmbed] });

    // AI generuje uporządkowane podsumowanie - opcjonalny "dodatek", jeśli moduł AI
    // jest skonfigurowany; jeśli nie, ticket i tak istnieje z surowym opisem powyżej
    const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (aiConfig) {
      try {
        const summary = await generateAiReply(
          `Streść zwięźle poniższe zgłoszenie propozycji partnerstwa dla administracji serwera RP, w 3-4 zdaniach, ` +
            `wypunktuj kluczowe korzyści i ewentualne czerwone flagi jeśli je widzisz:\n\n${opis}`,
          aiConfig,
          { isPremium: false }
        );
        await channel.send({
          embeds: [new EmbedBuilder().setTitle("🤖 Podsumowanie AI").setDescription(summary).setColor(0x1a2a6c)],
        });
      } catch (err) {
        console.error("[partnerstwo] AI summary błąd:", err.message);
      }
    }

    const managerRoleId = await getRoleIdForPermission("PARTNERSHIP_MANAGER");
    if (managerRoleId) {
      await channel.send(`<@&${managerRoleId}> — nowe zgłoszenie partnerstwa czeka na rozpatrzenie.`);
    }

    return interaction.editReply(`✅ Zgłoszenie wysłane. Śledź temat na kanale: <#${channel.id}>`);
  },
};
