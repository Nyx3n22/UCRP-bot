/**
 * commands/rp/level.js
 * /level — pokazuje poziom, XP i ranking (siebie lub innej osoby).
 * XP naliczane automatycznie: wiadomości (messageCreate.js) i czas na
 * kanałach głosowych (voiceStateUpdate.js), oba przez levelService.js.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const levelService = require("../../services/levelService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("📈 | Sprawdza Twój poziom i XP")
    .addUserOption((o) => o.setName("osoba").setDescription("Czyj poziom sprawdzić (domyślnie Twój)").setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser("osoba") ?? interaction.user;
    const profile = await levelService.getProfile(target.id);
    const bar = levelService.buildProgressBar(profile.xpIntoLevel, profile.xpForNext);

    const embed = new EmbedBuilder()
      .setTitle(`📈 Poziom ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ extension: "png", size: 128 }))
      .addFields(
        { name: "Poziom", value: `${profile.level}`, inline: true },
        { name: "Ranking", value: `#${profile.rank}`, inline: true },
        { name: "Łącznie XP", value: `${profile.xp}`, inline: true },
        { name: "Postęp do następnego poziomu", value: `${bar}\n${profile.xpIntoLevel} / ${profile.xpForNext} XP` }
      )
      .setColor(0xf4900c);

    return interaction.reply({ embeds: [embed] });
  },
};
