/**
 * services/robloxClient.js
 * Wyłącznie publiczne, bezpłatne endpointy Roblox (bez kluczy API, bez OAuth).
 * Metoda weryfikacji: użytkownik wpisuje unikalny kod w opisie SWOJEGO
 * profilu Roblox, bot to sprawdza. Ten sam mechanizm co RoVer/Bloxlink
 * używają pod spodem, tylko we własnym wykonaniu — zero zależności od
 * zewnętrznych botów.
 */

async function getUserIdByUsername(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const match = data.data?.[0];
  return match ? { id: match.id, name: match.name } : null;
}

async function getUserDescription(userId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.description ?? "";
}

module.exports = { getUserIdByUsername, getUserDescription };
