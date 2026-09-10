/**
 * commands/rp/level.js
 * /level — pokazuje poziom, XP i ranking (siebie lub innej osoby).
 * XP naliczane automatycznie: wiadomości (messageCreate.js) i czas na
 * kanałach głosowych (voiceStateUpdate.js), oba przez levelService.js.
 */

const { SlashCommandBuilder } = require("discord.js");
const levelService = require("../../services/levelService");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("📈 | Sprawdza Twój poziom i XP")
    .addUserOption((o) => o.setName("osoba").setDescription("Czyj poziom sprawdzić (domyślnie Twój)").setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser("osoba") ?? interaction.user;
    const profile = await levelService.getProfile(target.id);
    const bar = ui.progressBar(profile.xpIntoLevel, profile.xpForNext, 12);

    const embed = ui.base({
      title: `📈 Poziom — ${target.username}`,
      description: `${bar}\n**${profile.xpIntoLevel}** / ${profile.xpForNext} XP do kolejnego poziomu`,
      color: ui.COLORS.LEVEL,
      thumbnail: target.displayAvatarURL({ extension: "png", size: 128 }),
      fields: [
        { name: "🏆 Poziom", value: `**${profile.level}**`, inline: true },
        { name: "🥇 Ranking", value: `**#${profile.rank}**`, inline: true },
        { name: "✨ Łącznie XP", value: `**${profile.xp}**`, inline: true },
      ],
    });

    return interaction.reply({ embeds: [embed] });
  },
};
