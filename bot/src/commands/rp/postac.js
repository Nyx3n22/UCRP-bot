/**
 * commands/rp/postac.js
 *
 * /postac [uzytkownik?] — wyświetla kartę postaci IC.
 * Jeśli parametr pominięty, pokazuje postać wywołującego.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postac")
    .setDescription("Wyświetla kartę postaci IC")
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
        content: `${target.id === interaction.user.id ? "Nie masz" : "Ten użytkownik nie ma"} jeszcze utworzonej postaci. Przejdź weryfikację na kanale weryfikacyjnym.`,
        ephemeral: true,
      });
    }

    const age = this._calculateAge(character.birthDateIC);

    const embed = new EmbedBuilder()
      .setTitle(`🎓 Karta postaci — ${character.firstNameIC} ${character.lastNameIC}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Imię i nazwisko IC", value: `${character.firstNameIC} ${character.lastNameIC}`, inline: true },
        { name: "Wiek IC", value: `${age}`, inline: true },
        { name: "Płeć", value: character.genderIC === "MALE" ? "Mężczyzna" : "Kobieta", inline: true },
        { name: "Konto Discord", value: `<@${target.id}>`, inline: true },
        { name: "Konto Roblox", value: character.user.robloxUsername ?? "—", inline: true },
        { name: "PESEL", value: `\`${character.pesel}\``, inline: true },
        { name: "Rok studiów", value: `${character.yearOfStudy ?? "—"}`, inline: true },
        { name: "Wynagrodzenie IC", value: `${character.salaryIC} zł`, inline: true },
        { name: "Wydział", value: character.faculty?.name ?? "Brak przypisania", inline: true },
        { name: "Tytuł naukowy", value: character.scientificTitle ?? "Brak", inline: true }
      )
      .setFooter({ text: `Nr albumu: ${character.albumNumber}` })
      .setColor(0x8a1538);

    await interaction.reply({ embeds: [embed] });
  },

  _calculateAge(birthDate) {
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  },
};
