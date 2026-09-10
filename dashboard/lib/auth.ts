import DiscordProvider from "next-auth/providers/discord";
import type { NextAuthOptions } from "next-auth";

/**
 * Logowanie do Dashboardu = Discord OAuth2. Nie tworzymy własnego systemu
 * kont — dostęp jest w 100% pochodną ról na serwerze Discord (patrz
 * lib/permissions.ts), więc jedyne co potrzebujemy z OAuth to identyfikacja
 * "kim jesteś", a nie osobne hasła do zarządzania.
 *
 * Avatar: profil Discordowy (`profile.avatar`) jest przepisywany na pełny
 * URL CDN przy każdym logowaniu, dzięki czemu `session.user.image` zawsze
 * pokazuje aktualne zdjęcie profilowe z Discorda (a nie placeholder).
 */

type DiscordProfile = {
  id: string;
  username: string;
  avatar: string | null;
  discriminator?: string;
};

function buildAvatarUrl(profile: DiscordProfile): string {
  if (profile.avatar == null) {
    // Stary system discriminatorów ("1234") vs nowy ("0" / unikalne nazwy).
    // Dla nowego liczymy domyślny awatar z ID (tak samo robi Discord).
    let defaultAvatarNumber: number;
    if (profile.discriminator && profile.discriminator !== "0") {
      defaultAvatarNumber = parseInt(profile.discriminator, 10) % 5;
    } else {
      defaultAvatarNumber = Number((BigInt(profile.id) >> BigInt(22)) % BigInt(6));
    }
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
  }
  const format = profile.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}?size=128`;
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: "identify guilds guilds.members.read" } },
    }),
  ],
  callbacks: {
    async jwt({ token, profile, user }) {
      if (profile) {
        const p = profile as DiscordProfile;
        token.discordId = p.id;
        // Świeży awatar przy każdym logowaniu (obchodzi zastarzały cache JWT).
        token.picture = buildAvatarUrl(p);
        if (p.username) token.name = p.username;
      }
      // Pierwsze logowanie — `user` niesie dane z profilu providera.
      if (user?.image && !token.picture) {
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.discordId = token.discordId;
        // Awatar z Discorda (z fallbackiem na to, co provider już ustawił).
        session.user.image = token.picture ?? session.user.image ?? null;
        if (token.name) session.user.name = token.name;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
