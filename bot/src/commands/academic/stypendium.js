const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const scholarshipService = require("../../services/scholarshipService");
const prisma = require("../../lib/prisma");
const { hasPermission } = require("../../config/roles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stypendium")
    .setDescription("System stypendialny")
    .addSubcommand((s) =>
      s
        .setName("wyplac")
        .setDescription("Wypłaca stypendia dla najlepszych studentów wydziału")
        .addStringOption((o) => o.setName("wydzial").setDescription("Nazwa wydziału").setRequired(true))
        .addNumberOption((o) => o.setName("min_gpa").setDescription("Minimalne GPA (domyślnie 4.5)").setRequired(false))
        .addIntegerOption((o) => o.setName("kwota").setDescription("Kwota IC (domyślnie 1500)").setRequired(false))
    )
    .addSubcommand((s) => s.setName("historia").setDescription("Twoja historia stypendiów")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "wyplac") {
      if (!(await hasPermission(interaction.member, "MANAGE_DEANERY"))) {
        return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
      }

      const wydzial = interaction.options.getString("wydzial");
      const minGpa = interaction.options.getNumber("min_gpa") ?? undefined;
      const kwota = interaction.options.getInteger("kwota") ?? undefined;

      const faculty = await prisma.faculty.findUnique({ where: { name: wydzial } });
      if (!faculty) return interaction.reply({ content: `Nie znaleziono wydziału "${wydzial}".`, ephemeral: true });

      await interaction.deferReply();
      const results = await scholarshipService.runPayoutForFaculty(faculty.id, { minGpa, amountIC: kwota });

      if (results.length === 0) {
        return interaction.editReply(`Brak studentów spełniających próg GPA na wydziale **${wydzial}**.`);
      }

      const summary = results.map((r) => `<@${r.userId}> — GPA ${r.gpa.toFixed(2)} — ${r.amountIC} IC`).join("\n");
      return interaction.editReply(`🎓 Wypłacono stypendia (${results.length}):\n${summary}`);
    }

    if (sub === "historia") {
      const history = await scholarshipService.history(interaction.user.id);
      if (history.length === 0) return interaction.reply({ content: "Nie otrzymałeś jeszcze stypendium.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle("🎓 Historia stypendiów")
        .setDescription(
          history.map((h) => `${h.issuedAt.toLocaleDateString("pl-PL")} — ${h.amountIC} IC (GPA ${h.gpaAtIssue.toFixed(2)})`).join("\n")
        )
        .setColor(0x8a1538);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
