/**
 * commands/admin/ticket.js
 * /ticket przypisz — kadra/administracja przypisuje się do ticketu
 * /ticket zamknij — zamyka ticket i generuje transkrypcję HTML
 * Otwieranie ticketów NIE jest już komendą - patrz ticketService.js
 * (panel z przyciskami per kategoria na kanale TICKET_PANEL).
 */

const { SlashCommandBuilder } = require("discord.js");
const ticketService = require("../../services/ticketService");
const { hasPermission } = require("../../config/roles");
const ui = require("../../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 | Zarządzanie ticketami")
    .addSubcommand((s) => s.setName("przypisz").setDescription("Przypisuje Cię do bieżącego ticketu"))
    .addSubcommand((s) => s.setName("zamknij").setDescription("Zamyka bieżący ticket i tworzy transkrypcję")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "przypisz") {
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.reply({
          embeds: [ui.noPermission("Przypisywanie ticketów wymaga uprawnienia **MODERATE**.")],
          ephemeral: true,
        });
      }
      const ticket = await require("../../lib/prisma").ticket.findFirst({
        where: { channelId: interaction.channelId },
      });
      if (!ticket) {
        return ui.replyError(interaction, "Tej komendy możesz użyć tylko na **kanale ticketu**.", "To nie jest ticket");
      }

      await ticketService.claimTicket(ticket.id, interaction.user.id);
      const embed = ui.success("Ticket przejęty", `🙋 <@${interaction.user.id}> zajął się tym ticketem.\n\nProsimy o chwilę cierpliwości ⏳`);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "zamknij") {
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.reply({
          embeds: [ui.noPermission("Zamykanie ticketów wymaga uprawnienia **MODERATE**.")],
          ephemeral: true,
        });
      }
      await interaction.reply({ embeds: [ui.loading("Zamykanie ticketu i generowanie transkrypcji…")] });
      await ticketService.closeTicket(interaction.guild, interaction.channel, interaction.user.id);
    }
  },
};
