/**
 * commands/admin/autorole.js
 * /autorole panel [grupa] — publikuje panel przycisków na bieżącym kanale
 * na podstawie konfiguracji z Dashboardu (ReactionRoleGroup).
 * /autorole grupy — pokazuje dostępne klucze grup (pomoc przy konfiguracji).
 */

const { SlashCommandBuilder } = require("discord.js");
const reactionRoleService = require("../../services/reactionRoleService");
const { hasPermission } = require("../../config/roles");

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
      return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "grupy") {
      const groups = await reactionRoleService.listGroups();
      if (groups.length === 0) {
        return interaction.reply({ content: "Brak skonfigurowanych grup — dodaj je w Dashboardzie.", ephemeral: true });
      }
      const list = groups.map((g) => `\`${g.key}\` — ${g.title}`).join("\n");
      return interaction.reply({ content: `**Dostępne grupy:**\n${list}`, ephemeral: true });
    }

    if (sub === "panel") {
      const key = interaction.options.getString("grupa");
      const group = await reactionRoleService.getGroup(key);
      if (!group) {
        return interaction.reply({ content: `Nie znaleziono grupy o kluczu "${key}". Sprawdź \`/autorole grupy\`.`, ephemeral: true });
      }

      try {
        const { embed, rows } = reactionRoleService.buildPanel(group);
        await interaction.channel.send({ embeds: [embed], components: rows });
        return interaction.reply({ content: `✅ Panel "${group.title}" opublikowany.`, ephemeral: true });
      } catch (err) {
        return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
      }
    }
  },
};
