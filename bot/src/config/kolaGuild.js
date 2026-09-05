/**
 * config/kolaGuild.js
 * Koła Naukowe żyją na INNYM serwerze Discord niż reszta bota (weryfikacja,
 * tickety, aplikacje itd. zostają na głównym GUILD_ID). ID tego drugiego
 * serwera ustawiane jest zmienną środowiskową KOLA_GUILD_ID - bot musi być
 * na niego zaproszony z uprawnieniami Manage Roles + Manage Channels.
 */

function getKolaGuild(client) {
  const guildId = process.env.KOLA_GUILD_ID;
  if (!guildId) {
    console.error("[kolaGuild] Brak zmiennej środowiskowej KOLA_GUILD_ID - Koła Naukowe nie będą działać.");
    return null;
  }
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error(`[kolaGuild] Bot nie jest na serwerze o ID ${guildId} (KOLA_GUILD_ID) albo cache jeszcze się nie załadował.`);
    return null;
  }
  return guild;
}

module.exports = { getKolaGuild };
