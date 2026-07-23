/**
 * lib/discord.ts
 * Dashboard nie ma dostępu do sesji gildii przez OAuth usera w prosty sposób
 * (zakres guilds.members.read wymaga dodatkowego zatwierdzenia przez Discorda
 * dla większości botów), więc pytamy o role usera przez REST API **botem**
 * (DISCORD_BOT_TOKEN) — bot i tak jest na serwerze i ma GuildMembers intent.
 */

const DISCORD_API = "https://discord.com/api/v10";

export async function fetchGuildMemberRoleIds(discordUserId: string): Promise<string[]> {
  const res = await fetch(
    `${DISCORD_API}/guilds/${process.env.GUILD_ID}/members/${discordUserId}`,
    {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: "no-store",
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return (data.roles as string[]) ?? [];
}

export type DiscordRole = { id: string; name: string; color: number; position: number };

/** Lista ról na serwerze - do dropdownów zamiast ręcznego wklejania ID */
export async function fetchGuildRoles(): Promise<DiscordRole[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${process.env.GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const roles: DiscordRole[] = await res.json();
  // @everyone (position 0, id == GUILD_ID) pomijamy - nikt nie przypisuje uprawnień na tej roli
  return roles
    .filter((r) => r.id !== process.env.GUILD_ID)
    .sort((a, b) => b.position - a.position);
}

export type DiscordChannel = { id: string; name: string; type: number; parent_id: string | null };

const TEXT_CHANNEL_TYPES = new Set([0, 5]); // 0 = text, 5 = announcement
const VOICE_CHANNEL_TYPES = new Set([2]); // 2 = voice

/** Lista kanałów na serwerze - do dropdownów zamiast ręcznego wklejania ID */
export async function fetchGuildChannels(): Promise<{ text: DiscordChannel[]; voice: DiscordChannel[] }> {
  const res = await fetch(`${DISCORD_API}/guilds/${process.env.GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return { text: [], voice: [] };

  const channels: DiscordChannel[] = await res.json();
  return {
    text: channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type)),
    voice: channels.filter((c) => VOICE_CHANNEL_TYPES.has(c.type)),
  };
}

/** Wysyła wiadomość (opcjonalnie z komponentami np. przyciskiem) na kanał - używane np. do publikacji panelu weryfikacji z Dashboardu */
export async function sendChannelMessage(
  channelId: string,
  payload: { embeds?: unknown[]; components?: unknown[]; content?: string }
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    return { ok: false, error };
  }
  return { ok: true };
}
