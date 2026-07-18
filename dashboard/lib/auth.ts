import DiscordProvider from "next-auth/providers/discord";
import type { NextAuthOptions } from "next-auth";

/**
 * Logowanie do Dashboardu = Discord OAuth2. Nie tworzymy własnego systemu
 * kont — dostęp jest w 100% pochodną ról na serwerze Discord (patrz
 * lib/permissions.ts), więc jedyne co potrzebujemy z OAuth to identyfikacja
 * "kim jesteś", a nie osobne hasła do zarządzania.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: "identify guilds guilds.members.read" } },
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.discordId = (profile as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { discordId?: string }).discordId = token.discordId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
