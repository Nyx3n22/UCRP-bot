/**
 * services/ticketService.js
 * Kategorie ticketów konfigurowane w Dashboardzie (tabela TicketCategoryConfig
 * po stronie Dashboardu — tu operujemy na categoryKey przekazanym z komendy/przycisku).
 */

const { ChannelType, PermissionFlagsBits, AttachmentBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const { getBoundChannelId } = require("../config/channels");

class TicketService {
  async openTicket(guild, member, categoryKey, categoryChannelId) {
    const channel = await guild.channels.create({
      name: `ticket-${member.user.username}`.toLowerCase().slice(0, 90),
      type: ChannelType.GuildText,
      parent: categoryChannelId ?? undefined,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });

    const ticket = await prisma.ticket.create({
      data: {
        ownerId: member.id,
        categoryKey,
        channelId: channel.id,
        status: "OPEN",
      },
    });

    await channel.send(
      `🎫 Ticket otwarty przez <@${member.id}>. Kategoria: **${categoryKey}**. Administracja zostanie powiadomiona.`
    );

    return { ticket, channel };
  }

  async claimTicket(ticketId, staffId) {
    return prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "CLAIMED", assignedToId: staffId },
    });
  }

  /** Generuje transkrypcję HTML z ostatnich wiadomości kanału, zapisuje do bazy i wysyła plik */
  async closeTicket(guild, channel, closedById) {
    const ticket = await prisma.ticket.findFirst({ where: { channelId: channel.id } });
    if (!ticket) throw new Error("Nie znaleziono ticketu dla tego kanału.");

    const messages = await this._fetchAllMessages(channel);
    const html = this._renderTranscriptHtml(channel, messages);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "CLOSED", transcriptHtml: html, closedAt: new Date() },
    });

    const transcriptChannelId = await getBoundChannelId("TICKET_TRANSCRIPTS");
    if (transcriptChannelId) {
      const transcriptChannel = await guild.channels.fetch(transcriptChannelId);
      const attachment = new AttachmentBuilder(Buffer.from(html, "utf-8"), {
        name: `transkrypcja-${ticket.id}.html`,
      });
      await transcriptChannel.send({
        content: `📄 Transkrypcja ticketu \`${ticket.id}\` (właściciel: <@${ticket.ownerId}>, zamknięty przez: <@${closedById}>)`,
        files: [attachment],
      });
    }

    await channel.delete().catch(() => null);
    return ticket;
  }

  async _fetchAllMessages(channel) {
    let messages = [];
    let lastId;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, before: lastId });
      if (batch.size === 0) break;
      messages = messages.concat(Array.from(batch.values()));
      lastId = batch.last().id;
      if (batch.size < 100) break;
    }
    return messages.reverse();
  }

  _renderTranscriptHtml(channel, messages) {
    const rows = messages
      .map(
        (m) => `
        <div class="msg">
          <span class="author">${this._escape(m.author.tag)}</span>
          <span class="time">${m.createdAt.toISOString()}</span>
          <div class="content">${this._escape(m.content)}</div>
        </div>`
      )
      .join("\n");

    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Transkrypcja #${this._escape(channel.name)}</title>
<style>
  body { font-family: sans-serif; background:#1e1f22; color:#eee; padding:20px; }
  .msg { border-bottom:1px solid #333; padding:8px 0; }
  .author { font-weight:bold; color:#8a1538; }
  .time { color:#888; font-size:12px; margin-left:8px; }
  .content { margin-top:4px; white-space:pre-wrap; }
</style></head>
<body><h2>Transkrypcja #${this._escape(channel.name)}</h2>${rows}</body></html>`;
  }

  _escape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
}

module.exports = new TicketService();
