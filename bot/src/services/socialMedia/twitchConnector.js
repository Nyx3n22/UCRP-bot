/**
 * services/socialMedia/twitchConnector.js
 * Twitch Helix API — publiczne, bezpłatne. Wymaga Client ID + Client Secret
 * (aplikacja z dev.twitch.tv) skonfigurowanych w Dashboardzie.
 *
 * "Nowa treść" dla Twitcha = rozpoczęcie streama (nie VOD-y), więc lastSeenId
 * przechowuje ID bieżącego streama, żeby nie powiadamiać wielokrotnie o tym samym.
 */

let cachedToken = { value: null, expiresAt: 0 };

async function getAppAccessToken(clientId, clientSecret) {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Twitch OAuth error: ${res.status}`);

  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

/**
 * @returns {object|null} { id, title, gameName, thumbnailUrl, startedAt } jeśli live, inaczej null
 */
async function checkLiveStatus({ clientId, clientSecret, username }) {
  const token = await getAppAccessToken(clientId, clientSecret);

  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(username)}`, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch Helix error: ${res.status}`);

  const data = await res.json();
  const stream = data.data?.[0];
  if (!stream) return null;

  return {
    id: stream.id,
    title: stream.title,
    gameName: stream.game_name,
    thumbnailUrl: stream.thumbnail_url.replace("{width}", "440").replace("{height}", "248"),
    startedAt: stream.started_at,
    url: `https://twitch.tv/${username}`,
  };
}

module.exports = { checkLiveStatus };
