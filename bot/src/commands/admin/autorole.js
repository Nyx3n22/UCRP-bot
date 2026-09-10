/**
 * commands/admin/autorole.js
 * /autorole panel [grupa] — publikuje panel przycisków na bieżącym kanale
 * na podstawie konfiguracji z Dashboardu (ReactionRoleGroup).
 * /autorole grupy — pokazuje dostępne klucze grup (pomoc przy konfiguracji).
 */

const { SlashCommandBuilder } = require("discord.js");
const reactionRoleService = require("../../services/reactionRoleService");
const { hasPermission } = require("../../config/roles");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("🎭 Zarządzanie panelami autoról")
    .addSubcommand((s) =>
      s
        .setName("panel")
        .setDescription("Publikuje panel autoról na tym kanale")
        .addStringOption((o) => o.setName("grupa").setDescription("Klucz grupy skonfigurowanej w Dashboardzie").setRequired(true))
    )
    .addSubcommand((s) => s.setName("grupy").setDescription("Lista dostępnych grup autoról")),

  async execute(interaction) {
    if (!(await hasPermission(interaction.member, "MANAGE_REACTION_ROLES"))) {
      return interaction.reply({
        embeds: [ui.noPermission("Panele autoról wymagają uprawnienia **MANAGE_REACTION_ROLES**.")],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "grupy") {
      const groups = await reactionRoleService.listGroups();
      if (groups.length === 0) {
        return interaction.reply({
          embeds: [ui.info("🎭 Grupy autoról", "Brak skonfigurowanych grup — dodaj je w Dashboardzie (zakładka **Autorole**).")],
          ephemeral: true,
        });
      }
      const embed = ui.base({
        title: "🎭 Dostępne grupy autoról",
        description: groups.map((g) => `▸ \`${g.key}\` — **${g.title}**`).join("\n"),
        color: ui.COLORS.BRASS,
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "panel") {
      const key = interaction.options.getString("grupa");
      const group = await reactionRoleService.getGroup(key);
      if (!group) {
        return ui.replyError(interaction, `Nie znaleziono grupy o kluczu \`${key}\`. Sprawdź \`/autorole grupy\`.`, "Nie znaleziono grupy");
      }

      try {
        const { embed, rows } = reactionRoleService.buildPanel(group);
        await interaction.channel.send({ embeds: [embed], components: rows });
        return ui.replySuccess(interaction, `Panel **${group.title}** opublikowany na <#${interaction.channelId}>.`, "Panel opublikowany");
      } catch (err) {
        return ui.replyError(interaction, err.message, "Nie udało się opublikować panelu");
      }
    }
  },
};
