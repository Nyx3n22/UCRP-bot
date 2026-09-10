/**
 * commands/rp/postac.js
 *
 * /postac [uzytkownik?] — wyświetla kartę postaci IC.
 * Jeśli parametr pominięty, pokazuje postać wywołującego.
 */

const { SlashCommandBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postac")
    .setDescription("👤 | Wyświetla kartę postaci IC")
    .addUserOption((opt) =>
      opt.setName("uzytkownik").setDescription("Czyją postać sprawdzić").setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("uzytkownik") ?? interaction.user;

    const character = await prisma.character.findUnique({
      where: { userId: target.id },
      include: { faculty: true, user: true },
    });

    if (!character) {
      return interaction.reply({
        embeds: [
          ui.info(
            "👤 Karta postaci",
            target.id === interaction.user.id
              ? "Nie masz jeszcze utworzonej postaci.\n\nPrzejdź **weryfikację** na kanale weryfikacyjnym, aby ją założyć."
              : "Ten użytkownik nie ma jeszcze utworzonej postaci."
          ),
        ],
        ephemeral: true,
      });
    }

    const age = this._calculateAge(character.birthDateIC);

    const robloxField = character.user.robloxUsername
      ? `[${character.user.robloxUsername}](https://www.roblox.com/users/${character.user.robloxId}/profile)`
      : "—";

    const fields = [
      { name: "📛 Imię i nazwisko IC", value: `**${character.firstNameIC} ${character.lastNameIC}**`, inline: true },
      { name: "🎂 Wiek IC", value: `**${age}**`, inline: true },
      { name: "⚧ Płeć", value: character.genderIC === "MALE" ? "Mężczyzna" : "Kobieta", inline: true },
      { name: "💬 Konto Discord", value: `<@${target.id}>`, inline: true },
      { name: "🎮 Konto Roblox", value: robloxField, inline: true },
      { name: "🪪 PESEL", value: `\`${character.pesel}\``, inline: true },
    ];

    // "Rok studiów" ma sens tylko dla kogoś kto faktycznie studiuje - dla kadry/administracji
    // bez przypisanego roku to pole tylko myliło (pokazywało "—" nawet dla wykładowców)
    if (character.yearOfStudy !== null && character.yearOfStudy !== undefined) {
      fields.push({ name: "📚 Rok studiów", value: `**${character.yearOfStudy}**`, inline: true });
    }

    fields.push(
      { name: "💰 Wynagrodzenie IC", value: `**${character.salaryIC} zł**`, inline: true },
      { name: "🏛️ Wydział", value: character.faculty?.name ?? "_Brak przypisania_", inline: true },
      { name: "🎓 Tytuł naukowy", value: character.scientificTitle ?? "Brak", inline: true }
    );

    const embed = ui.base({
      title: `🎓 Karta postaci — ${character.firstNameIC} ${character.lastNameIC}`,
      color: ui.COLORS.BURGUNDY,
      thumbnail: target.displayAvatarURL(),
      fields,
      footer: `Nr albumu: ${character.albumNumber} • ${ui.BRAND_FOOTER}`,
    });

    // Widoczne tylko dla osoby, która wywołała komendę - nie dla całego kanału
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  _calculateAge(birthDate) {
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  },
};
