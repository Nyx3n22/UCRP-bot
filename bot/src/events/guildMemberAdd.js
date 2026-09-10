/**
 * events/guildMemberAdd.js
 * Nadaje skonfigurowane autorole przy dołączeniu i kieruje na kanał weryfikacji.
 * Lista autoról trzymana w ChannelBinding pod kluczem "AUTOROLE_JSON" (tablica ID),
 * analogicznie do LECTURE_HALLS_JSON — edytowalna z Dashboardu.
 */

const { getBoundChannelId } = require("../config/channels");
const ui = require("../utils/embeds");

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    const autoroleRaw = await getBoundChannelId("AUTOROLE_JSON");
    if (autoroleRaw) {
      try {
        const roleIds = JSON.parse(autoroleRaw);
        for (const roleId of roleIds) {
          await member.roles.add(roleId).catch(() => null);
        }
      } catch (err) {
        console.error("[guildMemberAdd] Błędny format AUTOROLE_JSON:", err);
      }
    }

    const verificationChannelId = await getBoundChannelId("VERIFICATION");
    if (verificationChannelId) {
      await member
        .send({
          embeds: [
            ui.base({
              title: "👋 Witaj na Uniwersytecie Centralnym RP!",
              description:
                `Cieszymy się, że do nas dołączyłeś/aś, <@${member.id}>! 🎓\n\n` +
                `Aby uzyskać dostęp do serwera, przejdź **weryfikację postaci (IC)** na kanale <#${verificationChannelId}>.\n\n` +
                `${ui.DIVIDER}\n❓ Masz pytania? Zapytaj na czacie — chętnie pomożemy!`,
              color: ui.COLORS.BRASS,
              thumbnail: member.guild.iconURL(),
            }),
          ],
        })
        .catch(() => null); // DM mogą być zablokowane — nie blokujemy dołączenia
    }
  },
};
