/**
 * commands/admin/moderacja.js
 * Podstawowe komendy administracyjne + wydawanie kar dyscyplinarnych IC.
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { hasPermission } = require("../../config/roles");
const punishmentService = require("../../services/punishmentService");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("moderacja")
    .setDescription("🛡️ Narzędzia administracyjne")
    .addSubcommand((s) =>
      s
        .setName("ban")
        .setDescription("Banuje użytkownika")
        .addUserOption((o) => o.setName("uzytkownik").setDescription("Kogo zbanować").setRequired(true))
        .addStringOption((o) => o.setName("powod").setDescription("Powód").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("kick")
        .setDescription("Wyrzuca użytkownika")
        .addUserOption((o) => o.setName("uzytkownik").setDescription("Kogo wyrzucić").setRequired(true))
        .addStringOption((o) => o.setName("powod").setDescription("Powód").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("mute")
        .setDescription("Wycisza użytkownika (timeout)")
        .addUserOption((o) => o.setName("uzytkownik").setDescription("Kogo wyciszyć").setRequired(true))
        .addIntegerOption((o) => o.setName("minuty").setDescription("Czas w minutach").setRequired(true))
        .addStringOption((o) => o.setName("powod").setDescription("Powód").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("clear")
        .setDescription("Usuwa wiadomości z kanału")
        .addIntegerOption((o) => o.setName("ilosc").setDescription("1-100").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("kara")
        .setDescription("Wydaje karę dyscyplinarną IC")
        .addUserOption((o) => o.setName("uzytkownik").setDescription("Komu wydać karę").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("rodzaj")
            .setDescription("Rodzaj kary")
            .setRequired(true)
            .addChoices(
              { name: "Upomnienie", value: "UPOMNIENIE" },
              { name: "Nagana", value: "NAGANA" },
              { name: "Zawieszenie", value: "ZAWIESZENIE" },
              { name: "Wydalenie", value: "WYDALENIE" }
            )
        )
        .addStringOption((o) => o.setName("powod").setDescription("Powód").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("ogloszenie")
        .setDescription("Wysyła oficjalne ogłoszenie na skonfigurowany kanał")
        .addStringOption((o) => o.setName("tresc").setDescription("Treść ogłoszenia").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (!(await hasPermission(interaction.member, "MODERATE")) && sub !== "kara") {
      return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
    }

    if (sub === "ban") return this._ban(interaction);
    if (sub === "kick") return this._kick(interaction);
    if (sub === "mute") return this._mute(interaction);
    if (sub === "clear") return this._clear(interaction);
    if (sub === "kara") return this._kara(interaction);
    if (sub === "ogloszenie") return this._ogloszenie(interaction);
  },

  async _ban(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const reason = interaction.options.getString("powod");
    await interaction.guild.members.ban(user.id, { reason });
    await this._log(interaction, "BAN", user.id, { reason });
    return interaction.reply(`🔨 Zbanowano <@${user.id}>. Powód: ${reason}`);
  },

  async _kick(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const reason = interaction.options.getString("powod");
    const member = await interaction.guild.members.fetch(user.id);
    await member.kick(reason);
    await this._log(interaction, "KICK", user.id, { reason });
    return interaction.reply(`👢 Wyrzucono <@${user.id}>. Powód: ${reason}`);
  },

  async _mute(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const minutes = interaction.options.getInteger("minuty");
    const reason = interaction.options.getString("powod");
    const member = await interaction.guild.members.fetch(user.id);
    await member.timeout(minutes * 60 * 1000, reason);
    await this._log(interaction, "MUTE", user.id, { reason, minutes });
    return interaction.reply(`🔇 Wyciszono <@${user.id}> na ${minutes} min. Powód: ${reason}`);
  },

  async _clear(interaction) {
    const amount = interaction.options.getInteger("ilosc");
    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: "Podaj wartość 1-100.", ephemeral: true });
    }
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await this._log(interaction, "CLEAR", null, { amount: deleted.size, channel: interaction.channel.id });
    return interaction.reply({ content: `🧹 Usunięto ${deleted.size} wiadomości.`, ephemeral: true });
  },

  async _kara(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const severity = interaction.options.getString("rodzaj");
    const reason = interaction.options.getString("powod");

    // Wydalenie i zawieszenie wymagają wyższych uprawnień (Władze Uczelni), reszta - moderacji
    const requiresHighAuth = severity === "WYDALENIE" || severity === "ZAWIESZENIE";
    const permKey = requiresHighAuth ? "MANAGE_DEANERY" : "MODERATE";
    if (!(await hasPermission(interaction.member, permKey))) {
      return interaction.reply({ content: "❌ Brak uprawnień do wydania tej kary.", ephemeral: true });
    }

    await punishmentService.issue(interaction.guild, {
      targetUserId: user.id,
      issuedById: interaction.user.id,
      reason,
      severity,
    });

    return interaction.reply(`⚖️ Wydano karę **${severity}** dla <@${user.id}>. Powód: ${reason}`);
  },

  async _ogloszenie(interaction) {
    const { getBoundChannelId } = require("../../config/channels");
    const treść = interaction.options.getString("tresc");
    const channelId = await getBoundChannelId("ANNOUNCEMENTS");
    if (!channelId) return interaction.reply({ content: "Kanał ogłoszeń nie jest skonfigurowany w Dashboardzie.", ephemeral: true });

    const channel = await interaction.guild.channels.fetch(channelId);
    const embed = new EmbedBuilder()
      .setTitle("📢 Ogłoszenie")
      .setDescription(treść)
      .setColor(0x1a2a6c)
      .setFooter({ text: `Nadawca: ${interaction.user.tag}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: "✅ Ogłoszenie wysłane.", ephemeral: true });
  },

  async _log(interaction, action, targetId, metadata) {
    await prisma.actionLog.create({
      data: { actorId: interaction.user.id, action, targetId, metadata },
    });
  },
};
