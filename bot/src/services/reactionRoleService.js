/**
 * services/reactionRoleService.js
 * Grupy i opcje przycisków konfigurowane w Dashboardzie (ReactionRoleGroup/
 * ReactionRoleOption). Bot tylko renderuje panel i obsługuje toggle roli
 * po kliknięciu — sama definicja "jaka rola pod jakim przyciskiem" nigdy
 * nie jest hardkodowana w komendzie.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const prisma = require("../lib/prisma");

const STYLE_MAP = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

const MAX_BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;

class ReactionRoleService {
  async getGroup(key) {
    return prisma.reactionRoleGroup.findUnique({
      where: { key },
      include: { options: { orderBy: { order: "asc" } } },
    });
  }

  async listGroups() {
    return prisma.reactionRoleGroup.findMany({ select: { key: true, title: true } });
  }

  /** Buduje embed + rzędy przycisków gotowe do wysłania na kanał */
  buildPanel(group) {
    if (group.options.length === 0) {
      throw new Error(`Grupa "${group.key}" nie ma jeszcze skonfigurowanych opcji w Dashboardzie.`);
    }
    if (group.options.length > MAX_BUTTONS_PER_ROW * MAX_ROWS) {
      throw new Error(`Grupa "${group.key}" ma za dużo opcji (limit Discorda: ${MAX_BUTTONS_PER_ROW * MAX_ROWS}).`);
    }

    const embed = new EmbedBuilder()
      .setTitle(group.title)
      .setDescription(group.description ?? "Kliknij przycisk, aby nadać lub zdjąć rolę.")
      .setColor(0x1a2a6c);

    const rows = [];
    for (let i = 0; i < group.options.length; i += MAX_BUTTONS_PER_ROW) {
      const chunk = group.options.slice(i, i + MAX_BUTTONS_PER_ROW);
      const row = new ActionRowBuilder().addComponents(
        chunk.map((opt) => {
          const button = new ButtonBuilder()
            .setCustomId(`reactionrole:${opt.discordRoleIds.join(",")}`)
            .setLabel(opt.label)
            .setStyle(STYLE_MAP[opt.style] ?? ButtonStyle.Secondary);
          if (opt.emoji) button.setEmoji(opt.emoji);
          return button;
        })
      );
      rows.push(row);
    }

    return { embed, rows };
  }
}

module.exports = new ReactionRoleService();
