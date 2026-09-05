/**
 * services/partnerstwoService.js
 * Zgłaszanie propozycji partnerstwa - dawniej /partnerstwo zglos, teraz
 * panel z przyciskiem na kanale skonfigurowanym w Dashboardzie
 * (klucz kanału: PARTNERSTWO_PANEL).
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require("discord.js");
const { generateBanner } = require("../utils/banner");
const ticketService = require("./ticketService");
const { generateAiReply } = require("./aiGatewayService");
const { getRoleIdForPermission } = require("../config/roles");
const { getBoundChannelId } = require("../config/channels");
const prisma = require("../lib/prisma");

class PartnerstwoService {
  buildPanelEmbed() {
    return new EmbedBuilder()
      .setTitle("🤝 Partnerstwa i współprace")
      .setDescription("Reprezentujesz serwer/markę zainteresowaną współpracą? Kliknij przycisk, aby zgłosić propozycję.")
      .setColor(0xc9a15a).setTimestamp();
  }

  buildPanelRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("partnerstwo_start").setLabel("🤝 Zgłoś partnerstwo").setStyle(ButtonStyle.Primary)
    );
  }

  async ensurePanelPosted(client) {
    try {
      const channelId = await getBoundChannelId("PARTNERSTWO_PANEL");
      if (!channelId) return;
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
      const already = recent?.find(
        (m) => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === "partnerstwo_start"
      );
      if (already) return;

      const banner = new AttachmentBuilder(generateBanner("Partnerstwa i Współprace"), { name: "banner.png" });
      await channel.send({
        embeds: [this.buildPanelEmbed().setImage("attachment://banner.png")],
        components: [this.buildPanelRow()],
        files: [banner],
      });
    } catch (err) {
      console.error("[partnerstwoService] Błąd publikacji panelu:", err.message);
    }
  }

  buildModal() {
    return new ModalBuilder()
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
  }

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
        console.error("[partnerstwoService] AI summary błąd:", err.message);
      }
    }

    const managerRoleId = await getRoleIdForPermission("PARTNERSHIP_MANAGER");
    if (managerRoleId) {
      await channel.send(`<@&${managerRoleId}> — nowe zgłoszenie partnerstwa czeka na rozpatrzenie.`);
    }

    return interaction.editReply(`✅ Zgłoszenie wysłane. Śledź temat na kanale: <#${channel.id}>`);
  }
}

module.exports = new PartnerstwoService();
