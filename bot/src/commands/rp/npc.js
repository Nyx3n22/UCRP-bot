/**
 * commands/rp/npc.js
 * /npc rozmawiaj [postac] [wiadomosc] - AI generuje odpowiedź w osobowości
 * zdefiniowanej dla danego NPC (Dashboard, zakładka NPC), wysyłaną przez
 * webhook żeby wyglądała jak wiadomość od innej "osoby" (inna nazwa/awatar),
 * nie od samego bota.
 * /npc lista - pokazuje dostępne postacie NPC.
 *
 * Zużywa te same kredyty AI co normalna bramka (kadra/donatorzy bez zmian
 * w logice) - to wciąż wywołanie modelu, tylko z innym systemowym promptem.
 */

const { SlashCommandBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");
const { generateAiReply } = require("../../services/aiGatewayService");
const { AiCreditService, CreditError } = require("../../services/aiCreditService");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("npc")
    .setDescription("🤖 | Rozmowa z postacią tła (NPC) grywaną przez AI")
    .addSubcommand((s) =>
      s
        .setName("rozmawiaj")
        .setDescription("Wysyła wiadomość do NPC i publikuje jego odpowiedź")
        .addStringOption((o) => o.setName("postac").setDescription("Nazwa NPC").setRequired(true))
        .addStringOption((o) => o.setName("wiadomosc").setDescription("Co mówisz do NPC").setRequired(true))
    )
    .addSubcommand((s) => s.setName("lista").setDescription("Lista dostępnych postaci NPC")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "lista") return this._lista(interaction);
    if (sub === "rozmawiaj") return this._rozmawiaj(interaction);
  },

  async _lista(interaction) {
    const npcs = await prisma.npcCharacter.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    if (npcs.length === 0) {
      return interaction.reply({
        embeds: [ui.info("🎭 Postacie NPC", "Brak skonfigurowanych postaci NPC.\n\nDodaj je w Dashboardzie (zakładka **Postacie NPC**).")],
        ephemeral: true,
      });
    }
    const embed = ui.base({
      title: "🎭 Dostępne postacie NPC",
      description: `${npcs.map((n) => `▸ **${n.name}**`).join("\n")}\n\n${ui.DIVIDER}\nUżyj \`/npc rozmawiaj\`, aby porozmawiać z wybraną postacią.`,
      color: ui.COLORS.BRASS,
    });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async _rozmawiaj(interaction) {
    const npcName = interaction.options.getString("postac");
    const wiadomosc = interaction.options.getString("wiadomosc");

    const npc = await prisma.npcCharacter.findFirst({ where: { name: npcName, active: true } });
    if (!npc) {
      return ui.replyError(interaction, `Nie znaleziono aktywnej postaci **${npcName}**.\n\nSprawdź listę: \`/npc lista\`.`, "Nie znaleziono NPC");
    }

    const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (!aiConfig) {
      return ui.replyError(interaction, "Brakuje tokena Hugging Face w Dashboardzie (zakładka **Moduł AI**).", "Moduł AI nieskonfigurowany");
    }

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ embeds: [ui.loading(`**${npc.name}** pisze odpowiedź…`)] });

    let credit;
    try {
      credit = await AiCreditService.chargeForMessage(interaction.member, wiadomosc);
    } catch (err) {
      if (err instanceof CreditError) {
        return interaction.editReply({ content: null, embeds: [ui.warning("Limit kredytów AI", err.message)] });
      }
      throw err;
    }

    const systemPrompt = `Jesteś postacią RP o imieniu ${npc.name} na serwerze Uniwersytet Centralny RP. Twoja osobowość i tło: ${npc.personality}\n\nOdpowiadaj W PIERWSZEJ OSOBIE, w charakterze tej postaci, zwięźle (2-4 zdania), pozostając w pełni w roli - nigdy nie wspominaj że jesteś AI.`;

    let response;
    try {
      response = await generateAiReply(wiadomosc, aiConfig, { isPremium: credit.unlimited, systemPrompt });
    } catch (err) {
      return interaction.editReply({ content: null, embeds: [ui.error("Błąd generowania odpowiedzi", err.message)] });
    }

    // Publikacja przez webhook - wygląda jak wiadomość od "innej osoby" (nazwa+awatar NPC), nie od bota
    const webhook = await this._getOrCreateWebhook(interaction.channel);
    await webhook.send({
      content: response,
      username: npc.name,
      avatarURL: npc.avatarUrl || undefined,
    });

    return interaction.editReply({ content: null, embeds: [ui.success("NPC odpowiedział", `🎭 **${npc.name}** odpowiedział/a na kanale <#${interaction.channelId}>.`)] });
  },

  async _getOrCreateWebhook(channel) {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find((w) => w.name === "UWRP NPC Relay");
    if (!webhook) {
      webhook = await channel.createWebhook({ name: "UWRP NPC Relay" });
    }
    return webhook;
  },
};
