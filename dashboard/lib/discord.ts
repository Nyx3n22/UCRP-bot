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
