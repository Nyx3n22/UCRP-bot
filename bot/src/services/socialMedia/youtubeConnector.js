/**
 * services/socialMedia/youtubeConnector.js
 * YouTube Data API v3 — wymaga klucza API (Google Cloud Console),
 * bezpłatny limit dzienny wystarcza na polling co kilka minut dla
 * rozsądnej liczby kanałów.
 */

async function getLatestVideo({ apiKey, channelId }) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("type", "video");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube Data API error: ${res.status}`);

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  return {
    id: item.id.videoId,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.high?.url,
    publishedAt: item.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  };
}

module.exports = { getLatestVideo };
