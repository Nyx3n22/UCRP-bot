import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "W trakcie rozpatrywania",
  ACCEPTED: "Zaakceptowane",
  REJECTED: "Odrzucone",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "text-parchment/60",
  ACCEPTED: "text-green-400",
  REJECTED: "text-burgundy",
};

export default async function ApplyStatusPage() {
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { discordId?: string } | undefined)?.discordId;

  const applications = discordId
    ? await prisma.application.findMany({ where: { userId: discordId }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <div>
      <h2 className="font-display text-xl mb-6">Moje podania</h2>
      <div className="flex flex-col gap-3">
        {applications.map((a) => (
          <div key={a.id} className="card p-4 flex justify-between items-center">
            <div>
              <p className="font-display">{a.type}</p>
              <p className="text-xs text-parchment/40">{a.createdAt.toLocaleDateString("pl-PL")}</p>
            </div>
            <p className={`text-sm font-medium ${STATUS_COLORS[a.status]}`}>{STATUS_LABELS[a.status]}</p>
          </div>
        ))}
        {applications.length === 0 && (
          <p className="text-parchment/40 text-sm">Nie złożyłeś jeszcze żadnego podania.</p>
        )}
      </div>
    </div>
  );
}
