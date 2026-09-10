const { SlashCommandBuilder } = require("discord.js");
const thesisService = require("../../services/thesisService");
const ui = require("../../utils/embeds");

const STATUS_LABELS = {
  IN_PROGRESS: "🔨 W trakcie",
  UNDER_REVIEW: "🔍 W recenzji",
  ACCEPTED: "✅ Zaakceptowana",
  REJECTED: "❌ Odrzucona",
};

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
        const embed = ui.success(
          "Praca zarejestrowana",
          `📄 **${tytul}**\n\n👨‍🏫 Promotor: <@${promotor.id}>\n🆔 ID pracy: \`${thesis.id}\``
        );
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "status") {
        // Uprawnienia weryfikuje thesisService.updateStatus (tylko przypisany
        // promotor) - tu nic nie blokujemy.
        const id = interaction.options.getString("id");
        const nowyStatus = interaction.options.getString("nowy_status");
        await thesisService.updateStatus(id, nowyStatus, interaction.user.id);
        const embed = ui.success(
          "Status pracy zmieniony",
          `🆔 Praca \`${id}\`\n📌 Nowy status: **${STATUS_LABELS[nowyStatus] ?? nowyStatus}**`
        );
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "moja") {
        const thesis = await thesisService.myThesis(interaction.user.id);
        if (!thesis) {
          return interaction.reply({
            embeds: [ui.info("📄 Moja praca dyplomowa", "Nie masz zarejestrowanej pracy dyplomowej.\n\nUżyj `/praca zarejestruj`, aby zgłosić temat.")],
            ephemeral: true,
          });
        }
        const embed = ui
          .base({
            title: `📄 ${thesis.title}`,
            color: ui.COLORS.INFO,
            thumbnail: interaction.user.displayAvatarURL(),
          })
          .addFields(
            { name: "👨‍🏫 Promotor", value: `<@${thesis.supervisorId}>`, inline: true },
            { name: "📌 Status", value: `**${STATUS_LABELS[thesis.status] ?? thesis.status}**`, inline: true },
            { name: "🆔 ID", value: `\`${thesis.id}\``, inline: true }
          );
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (err) {
      return ui.replyError(interaction, err.message, "Praca dyplomowa");
    }
  },
};
