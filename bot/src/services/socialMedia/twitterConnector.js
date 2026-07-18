/**
 * services/socialMedia/twitterConnector.js
 * X API v2 — WAŻNE OGRANICZENIE: od lutego 2023 darmowy tier nie ma dostępu
 * do odczytu (recent tweets by user). Ten connector działa poprawnie tylko
 * jeśli w Dashboardzie skonfigurowano Bearer Token z płatnego planu
 * (Basic lub wyższy), który daje dostęp do GET /2/users/:id/tweets.
 *
 * Jeśli token nie jest skonfigurowany, socialMediaService pomija subskrypcje
 * TWITTER zamiast wywalać cały cykl pollingu (patrz socialMediaService.js).
 */

async function getLatestTweet({ bearerToken, userId }) {
  const url = new URL(`https://api.twitter.com/2/users/${userId}/tweets`);
  url.searchParams.set("max_results", "5");
  url.searchParams.set("exclude", "retweets,replies");
  url.searchParams.set("tweet.fields", "created_at");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });

  if (res.status === 429) throw new Error("X API rate limit — spróbuj ponownie w kolejnym cyklu pollingu.");
  if (!res.ok) throw new Error(`X API error: ${res.status} (wymagany płatny tier dla tego endpointu)`);

  const data = await res.json();
  const tweet = data.data?.[0];
  if (!tweet) return null;

  return {
    id: tweet.id,
    text: tweet.text,
    publishedAt: tweet.created_at,
    url: `https://x.com/i/status/${tweet.id}`,
  };
}

module.exports = { getLatestTweet };
