/**
 * lib/discord.ts
 * Dashboard nie ma dostępu do sesji gildii przez OAuth usera w prosty sposób
 * (zakres guilds.members.read wymaga dodatkowego zatwierdzenia przez Discorda
 * dla większości botów), więc pytamy o role usera przez REST API **botem**
 * (DISCORD_BOT_TOKEN) — bot i tak jest na serwerze i ma GuildMembers intent.
 */

const DISCORD_API = "https://discord.com/api/v10";

export async function fetchGuildMemberRoleIds(discordUserId: string): Promise<string[]> {
  const { roleIds } = await fetchGuildMemberRoleIdsDebug(discordUserId);
  return roleIds;
}

/** Wersja z pełną diagnostyką - używana na stronie /unauthorized, żeby było widać PRZYCZYNĘ, nie tylko efekt */
export async function fetchGuildMemberRoleIdsDebug(
  discordUserId: string
): Promise<{ roleIds: string[]; status: number | "network_error"; guildId: string | undefined; hasToken: boolean }> {
  const guildId = process.env.GUILD_ID;
  const hasToken = Boolean(process.env.DISCORD_BOT_TOKEN);

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: "no-store",
    });

    if (!res.ok) return { roleIds: [], status: res.status, guildId, hasToken };

    const data = await res.json();
    return { roleIds: (data.roles as string[]) ?? [], status: res.status, guildId, hasToken };
  } catch {
    return { roleIds: [], status: "network_error", guildId, hasToken };
  }
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

/** Banuje użytkownika przez REST API (bot musi mieć uprawnienie Ban Members) */
export async function banGuildMember(userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${DISCORD_API}/guilds/${process.env.GUILD_ID}/bans/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      "X-Audit-Log-Reason": reason.slice(0, 500),
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) return { ok: false, error: await res.text().catch(() => res.statusText) };
  return { ok: true };
}

/** Wyrzuca użytkownika z serwera (nie to samo co ban - może dołączyć ponownie) */
export async function kickGuildMember(userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${DISCORD_API}/guilds/${process.env.GUILD_ID}/members/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "X-Audit-Log-Reason": reason.slice(0, 500),
    },
  });
  if (!res.ok) return { ok: false, error: await res.text().catch(() => res.statusText) };
  return { ok: true };
}

/** Wycisza użytkownika (Discord timeout) na dany czas w minutach */
export async function timeoutGuildMember(
  userId: string,
  minutes: number,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const res = await fetch(`${DISCORD_API}/guilds/${process.env.GUILD_ID}/members/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      "X-Audit-Log-Reason": reason.slice(0, 500),
    },
    body: JSON.stringify({ communication_disabled_until: until }),
  });
  if (!res.ok) return { ok: false, error: await res.text().catch(() => res.statusText) };
  return { ok: true };
}
