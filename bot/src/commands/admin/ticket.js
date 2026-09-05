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
        return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
      }
      const ticket = await require("../../lib/prisma").ticket.findFirst({
        where: { channelId: interaction.channelId },
      });
      if (!ticket) return interaction.reply({ content: "To nie jest kanał ticketu.", ephemeral: true });

      await ticketService.claimTicket(ticket.id, interaction.user.id);
      return interaction.reply(`🙋 <@${interaction.user.id}> przejął ten ticket.`);
    }

    if (sub === "zamknij") {
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.reply({ content: "❌ Brak uprawnień.", ephemeral: true });
      }
      await interaction.reply("🔒 Zamykanie ticketu i generowanie transkrypcji...");
      await ticketService.closeTicket(interaction.guild, interaction.channel, interaction.user.id);
    }
  },
};
