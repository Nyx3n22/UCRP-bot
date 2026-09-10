import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "⏳ W trakcie rozpatrywania",
  ACCEPTED: "✅ Zaakceptowane",
  REJECTED: "❌ Odrzucone",
};

const STATUS_BADGES: Record<string, string> = {
  PENDING: "badge badge-amber",
  ACCEPTED: "badge badge-green",
  REJECTED: "badge badge-red",
};

const TYPE_LABELS: Record<string, string> = {
  STUDENT: "🎓 Student",
  WYKLADOWCA: "👨‍🏫 Wykładowca",
  ADMINISTRACJA: "⚙️ Administracja",
};

export default async function ApplyStatusPage() {
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { discordId?: string } | undefined)?.discordId;

  const applications = discordId
    ? await prisma.application.findMany({ where: { userId: discordId }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl">Moje podania</h2>
      <div className="flex flex-col gap-3">
        {applications.map((a: any) => (
          <div key={a.id} className="card flex items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="font-display text-lg">{TYPE_LABELS[a.type] ?? a.type}</p>
              <p className="text-xs text-parchment/40">Złożono: {a.createdAt.toLocaleDateString("pl-PL")}</p>
            </div>
            <span className={STATUS_BADGES[a.status] ?? "badge badge-gray"}>
              {STATUS_LABELS[a.status] ?? a.status}
            </span>
          </div>
        ))}
        {applications.length === 0 && (
          <div className="card p-6 text-sm text-parchment/45">Nie złożyłeś jeszcze żadnego podania.</div>
        )}
      </div>
    </div>
  );
}
