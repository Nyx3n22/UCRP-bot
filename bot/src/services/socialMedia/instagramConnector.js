/**
 * services/socialMedia/instagramConnector.js
 * Meta Graph API — działa WYŁĄCZNIE dla kont Instagram Business/Creator
 * połączonych ze Stroną na Facebooku. Zwykłe konta prywatne/osobiste
 * nie są obsługiwane przez żadne oficjalne API Meta — to ograniczenie
 * po stronie Instagrama, nie bota.
 *
 * Wymaga długoterminowego Page Access Tokenu z uprawnieniem
 * instagram_basic (konfigurowanego w Dashboardzie, przechowywanego zaszyfrowanego).
 */

async function getLatestMedia({ accessToken, igUserId }) {
  const url = new URL(`https://graph.instagram.com/${igUserId}/media`);
  url.searchParams.set("fields", "id,caption,permalink,timestamp,media_url,media_type");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "1");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram Graph API error: ${res.status}`);

  const data = await res.json();
  const item = data.data?.[0];
  if (!item) return null;

  return {
    id: item.id,
    caption: item.caption?.slice(0, 200) ?? "",
    mediaUrl: item.media_url,
    permalink: item.permalink,
    publishedAt: item.timestamp,
  };
}

module.exports = { getLatestMedia };
