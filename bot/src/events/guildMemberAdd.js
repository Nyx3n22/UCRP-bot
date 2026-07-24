/**
 * events/guildMemberAdd.js
 * Nadaje skonfigurowane autorole przy dołączeniu i kieruje na kanał weryfikacji.
 * Lista autoról trzymana w ChannelBinding pod kluczem "AUTOROLE_JSON" (tablica ID),
 * analogicznie do LECTURE_HALLS_JSON — edytowalna z Dashboardu.
 */

const { getBoundChannelId } = require("../config/channels");

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
        .send(
          `👋 Witaj na Uniwersytecie Centralnym RP! Przejdź weryfikację na kanale <#${verificationChannelId}>, aby uzyskać dostęp do serwera.`
        )
        .catch(() => null); // DM mogą być zablokowane — nie blokujemy dołączenia
    }
  },
};
