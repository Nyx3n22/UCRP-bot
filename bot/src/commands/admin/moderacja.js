/**
 * commands/admin/moderacja.js
 * Podstawowe komendy administracyjne + wydawanie kar dyscyplinarnych IC.
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { hasPermission } = require("../../config/roles");
const punishmentService = require("../../services/punishmentService");
const prisma = require("../../lib/prisma");
const ui = require("../../utils/embeds");

/** Wspólny szablon embeda decyzji moderacyjnej. */
function moderationEmbed({ icon, title, targetId, reason, moderatorId, color, thumbnail }) {
  return ui.base({
    title: `${icon} ${title}`,
    description: `👤 Ukarany: <@${targetId}>\n📝 Powód: *${reason}*\n\n${ui.DIVIDER}\n🛡️ Moderator: <@${moderatorId}>`,
    color,
    thumbnail,
  });
}

const HIERARCHY_HINT = "Najczęstsze przyczyny: brak uprawnień bota albo **wyższa rola** ukaranego.";

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
      return interaction.reply({
        embeds: [ui.noPermission("Narzędzia moderacyjne wymagają uprawnienia **MODERATE**.")],
        ephemeral: true,
      });
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
    try {
      await interaction.guild.members.ban(user.id, { reason });
    } catch (err) {
      return ui.replyError(interaction, HIERARCHY_HINT, "Nie udało się zbanować");
    }
    await this._log(interaction, "BAN", user.id, { reason });
    const embed = moderationEmbed({
      icon: "🔨",
      title: "Użytkownik zbanowany",
      targetId: user.id,
      reason,
      moderatorId: interaction.user.id,
      color: ui.COLORS.ERROR,
      thumbnail: user.displayAvatarURL(),
    });
    return interaction.reply({ embeds: [embed] });
  },

  async _kick(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const reason = interaction.options.getString("powod");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return ui.replyError(interaction, "Tego użytkownika nie ma na serwerze — nie można go wyrzucić.", "Nie znaleziono użytkownika");
    }
    try {
      await member.kick(reason);
    } catch (err) {
      return ui.replyError(interaction, HIERARCHY_HINT, "Nie udało się wyrzucić");
    }
    await this._log(interaction, "KICK", user.id, { reason });
    const embed = moderationEmbed({
      icon: "👢",
      title: "Użytkownik wyrzucony",
      targetId: user.id,
      reason,
      moderatorId: interaction.user.id,
      color: ui.COLORS.WARNING,
      thumbnail: user.displayAvatarURL(),
    });
    return interaction.reply({ embeds: [embed] });
  },

  async _mute(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const minutes = interaction.options.getInteger("minuty");
    const reason = interaction.options.getString("powod");
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return ui.replyError(interaction, "Tego użytkownika nie ma na serwerze — nie można go wyciszyć.", "Nie znaleziono użytkownika");
    }
    try {
      await member.timeout(minutes * 60 * 1000, reason);
    } catch (err) {
      return ui.replyError(interaction, HIERARCHY_HINT, "Nie udało się wyciszyć");
    }
    await this._log(interaction, "MUTE", user.id, { reason, minutes });
    const embed = ui.base({
      title: "🔇 Użytkownik wyciszony",
      description: `👤 Wyciszony: <@${user.id}>\n⏱️ Czas: **${minutes} min**\n📝 Powód: *${reason}*\n\n${ui.DIVIDER}\n🛡️ Moderator: <@${interaction.user.id}>`,
      color: ui.COLORS.WARNING,
      thumbnail: user.displayAvatarURL(),
    });
    return interaction.reply({ embeds: [embed] });
  },

  async _clear(interaction) {
    const amount = interaction.options.getInteger("ilosc");
    if (amount < 1 || amount > 100) {
      return ui.replyError(interaction, "Podaj liczbę wiadomości z zakresu **1 – 100**.", "Nieprawidłowa liczba");
    }
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await this._log(interaction, "CLEAR", null, { amount: deleted.size, channel: interaction.channel.id });
    return ui.replySuccess(interaction, `🧹 Usunięto **${deleted.size}** wiadomości z <#${interaction.channel.id}>.`, "Kanał wyczyszczony");
  },

  async _kara(interaction) {
    const user = interaction.options.getUser("uzytkownik");
    const severity = interaction.options.getString("rodzaj");
    const reason = interaction.options.getString("powod");

    // Wydalenie i zawieszenie wymagają wyższych uprawnień (Władze Uczelni), reszta - moderacji
    const requiresHighAuth = severity === "WYDALENIE" || severity === "ZAWIESZENIE";
    const permKey = requiresHighAuth ? "MANAGE_DEANERY" : "MODERATE";
    if (!(await hasPermission(interaction.member, permKey))) {
      return interaction.reply({
        embeds: [ui.noPermission(`Kara **${severity}** wymaga uprawnienia **${permKey}**.`)],
        ephemeral: true,
      });
    }

    await punishmentService.issue(interaction.guild, {
      targetUserId: user.id,
      issuedById: interaction.user.id,
      reason,
      severity,
    });

    const SEVERITY_ICONS = { UPOMNIENIE: "📝", NAGANA: "⚠️", ZAWIESZENIE: "⛔", WYDALENIE: "🔨" };
    const embed = ui.base({
      title: `⚖️ Kara dyscyplinarna: ${severity}`,
      description: `${SEVERITY_ICONS[severity] ?? "⚖️"} Ukarany: <@${user.id}>\n📝 Powód: *${reason}*\n\n${ui.DIVIDER}\n🛡️ Wystawił: <@${interaction.user.id}>`,
      color: requiresHighAuth ? ui.COLORS.ERROR : ui.COLORS.BURGUNDY,
      thumbnail: user.displayAvatarURL(),
    });
    return interaction.reply({ embeds: [embed] });
  },

  async _ogloszenie(interaction) {
    const { getBoundChannelId } = require("../../config/channels");
    const tresc = interaction.options.getString("tresc");
    const channelId = await getBoundChannelId("ANNOUNCEMENTS");
    if (!channelId) {
      return ui.replyError(interaction, "Kanał ogłoszeń nie jest skonfigurowany w Dashboardzie (klucz **ANNOUNCEMENTS**).", "Brak konfiguracji");
    }

    const channel = await interaction.guild.channels.fetch(channelId);
    const embed = ui.base({
      title: "📢 Ogłoszenie",
      description: `${tresc}\n\n${ui.DIVIDER}\n✍️ Nadawca: <@${interaction.user.id}>`,
      color: ui.COLORS.INK,
    });

    await channel.send({ embeds: [embed] });
    return ui.replySuccess(interaction, `Ogłoszenie opublikowane na <#${channelId}>.`, "Wysłano");
  },

  async _log(interaction, action, targetId, metadata) {
    await prisma.actionLog.create({
      data: { actorId: interaction.user.id, action, targetId, metadata },
    });
  },
};
