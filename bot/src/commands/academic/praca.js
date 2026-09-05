const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const thesisService = require("../../services/thesisService");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("praca")
    .setDescription("📄 | Prace dyplomowe")
    .addSubcommand((s) =>
      s
        .setName("zarejestruj")
        .setDescription("Rejestruje pracę dyplomową")
        .addUserOption((o) => o.setName("promotor").setDescription("Promotor pracy").setRequired(true))
        .addStringOption((o) => o.setName("tytul").setDescription("Tytuł pracy").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("status")
        .setDescription("Zmienia status pracy (tylko promotor)")
        .addStringOption((o) => o.setName("id").setDescription("ID pracy").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("nowy_status")
            .setDescription("Nowy status")
            .setRequired(true)
            .addChoices(
              { name: "W trakcie", value: "IN_PROGRESS" },
              { name: "W recenzji", value: "UNDER_REVIEW" },
              { name: "Zaakceptowana", value: "ACCEPTED" },
              { name: "Odrzucona", value: "REJECTED" }
            )
        )
    )
    .addSubcommand((s) => s.setName("moja").setDescription("Pokazuje status Twojej pracy")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "zarejestruj") {
        const promotor = interaction.options.getUser("promotor");
        const tytul = interaction.options.getString("tytul");
        const thesis = await thesisService.register(interaction.user.id, promotor.id, tytul);
        return interaction.reply(
          `📄 Praca "**${tytul}**" zarejestrowana. Promotor: <@${promotor.id}>. ID: \`${thesis.id}\``
        );
      }

      if (sub === "status") {
        if (!(await hasPermission(interaction.member, "MANAGE_GRADES"))) {
          // promotor bez roli kadry i tak jest weryfikowany w serwisie (musi być przypisanym promotorem)
        }
        const id = interaction.options.getString("id");
        const nowyStatus = interaction.options.getString("nowy_status");
        await thesisService.updateStatus(id, nowyStatus, interaction.user.id);
        return interaction.reply(`✅ Status pracy \`${id}\` zmieniony na **${nowyStatus}**.`);
      }

      if (sub === "moja") {
        const thesis = await thesisService.myThesis(interaction.user.id);
        if (!thesis) return interaction.reply({ content: "Nie masz zarejestrowanej pracy dyplomowej.", ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle(`📄 ${thesis.title}`)
          .addFields(
            { name: "Promotor", value: `<@${thesis.supervisorId}>`, inline: true },
            { name: "Status", value: thesis.status, inline: true }
          )
          .setColor(0x2a52be)
          .setFooter({ text: `ID: ${thesis.id}` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  },
};
