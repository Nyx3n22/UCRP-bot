import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { hasDashboardAccess } from "@/lib/permissions";
import { fetchGuildMemberRoleIdsDebug } from "@/lib/discord";
import Sidebar from "@/components/Sidebar";

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

  return (
    <div className="flex min-h-screen items-stretch">
      <Sidebar userTag={session.user.name ?? "Nieznany"} />
      <main className="min-w-0 flex-1 px-8 py-10 lg:px-12">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
