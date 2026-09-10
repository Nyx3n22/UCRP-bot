import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { hasDashboardAccess } from "@/lib/permissions";
import { fetchGuildMemberRoleIdsDebug } from "@/lib/discord";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const discordId = (session.user as { discordId?: string }).discordId;
  if (!discordId) redirect("/login");

  const allowed = await hasDashboardAccess(discordId);

  if (!allowed) {
    const debug = await fetchGuildMemberRoleIdsDebug(discordId);
    const params = new URLSearchParams({
      discordId,
      status: String(debug.status),
      guildId: debug.guildId ?? "(brak)",
      hasToken: String(debug.hasToken),
      roleCount: String(debug.roleIds.length),
      roles: debug.roleIds.join(","),
    });
    redirect(`/unauthorized?${params.toString()}`);
  }

  const userTag = session.user.name ?? "Nieznany";

  return (
    <div className="flex min-h-screen items-stretch">
      <Sidebar userTag={userTag} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userTag={userTag} />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
        <footer className="px-8 pb-6 text-center text-[0.7rem] tracking-wide text-parchment/25 lg:px-12">
          Uniwersytet Centralny RP · Panel administracyjny
        </footer>
      </div>
    </div>
  );
}
