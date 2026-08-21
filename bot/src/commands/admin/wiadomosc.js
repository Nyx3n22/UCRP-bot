/**
 * commands/admin/wiadomosc.js
 * Ogólny moduł wysyłania wiadomości przez bota - zwykły tekst albo w pełni
 * skonfigurowany embed (tytuł, opis, kolor, obrazek, stopka), na dowolny kanał.
 * To nadzbiór tego co robią /moderacja ogloszenie i /dziekanat ogloszenie -
 * te zostają (mają swój specyficzny, gotowy format), a to jest opcja
 * dla wszystkiego innego, co nie pasuje do żadnego gotowego szablonu.
 */

const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("wiadomosc")
    .setDescription("📢 Wysyła wiadomość przez bota")
    .addSubcommand((s) =>
      s
        .setName("tekst")
        .setDescription("Wysyła zwykłą wiadomość tekstową")
        .addChannelOption((o) => o.setName("kanal").setDescription("Docelowy kanał").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("embed")
        .setDescription("Otwiera kreator wiadomości embed (tytuł, opis, kolor, obrazek)")
        .addChannelOption((o) => o.setName("kanal").setDescription("Docelowy kanał").setRequired(true))
    ),

  async execute(interaction) {
    if (!(await hasPermission(interaction.member, "MANAGE_TECH")) && !(await hasPermission(interaction.member, "MODERATE"))) {
      return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const kanal = interaction.options.getChannel("kanal");

    if (sub === "tekst") {
      const modal = new ModalBuilder()
        .setCustomId(`wiadomosc_tekst_modal:${kanal.id}`)
        .setTitle("Wiadomość tekstowa")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("tresc").setLabel("Treść wiadomości").setStyle(TextInputStyle.Paragraph).setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    if (sub === "embed") {
      const modal = new ModalBuilder()
        .setCustomId(`wiadomosc_embed_modal:${kanal.id}`)
        .setTitle("Kreator embed")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("tytul").setLabel("Tytuł").setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("opis").setLabel("Treść / opis").setStyle(TextInputStyle.Paragraph).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("kolor")
              .setLabel("Kolor HEX (np. 1a2a6c) - opcjonalnie")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("obrazek")
              .setLabel("URL obrazka (opcjonalnie)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("stopka").setLabel("Stopka (opcjonalnie)").setStyle(TextInputStyle.Short).setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }
  },

  /** Wywoływane z interactionCreate.js po submit modala tekstowego */
  async handleTextModalSubmit(interaction, channelId) {
    const tresc = interaction.fields.getTextInputValue("tresc");
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.reply({ content: "❌ Nie znaleziono kanału.", ephemeral: true });

    await channel.send(tresc);
    return interaction.reply({ content: `✅ Wysłano na <#${channelId}>.`, ephemeral: true });
  },

  /** Wywoływane z interactionCreate.js po submit modala embed */
  async handleEmbedModalSubmit(interaction, channelId) {
    const tytul = interaction.fields.getTextInputValue("tytul");
    const opis = interaction.fields.getTextInputValue("opis");
    const kolorRaw = interaction.fields.getTextInputValue("kolor").trim().replace("#", "");
    const obrazek = interaction.fields.getTextInputValue("obrazek").trim();
    const stopka = interaction.fields.getTextInputValue("stopka").trim();

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.reply({ content: "❌ Nie znaleziono kanału.", ephemeral: true });

    const color = /^[0-9a-fA-F]{6}$/.test(kolorRaw) ? parseInt(kolorRaw, 16) : 0x1a2a6c;

    const embed = new EmbedBuilder().setTitle(tytul).setDescription(opis).setColor(color);
    if (obrazek) embed.setImage(obrazek);
    if (stopka) embed.setFooter({ text: stopka });

    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: `✅ Wysłano embed na <#${channelId}>.`, ephemeral: true });
  },
};
