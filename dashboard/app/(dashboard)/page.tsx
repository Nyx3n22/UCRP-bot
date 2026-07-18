import { prisma } from "@/lib/prisma";

async function getStats() {
  const [characters, tickets, applications, punishments, activeExams] = await Promise.all([
    prisma.character.count(),
    prisma.ticket.count({ where: { status: { not: "CLOSED" } } }),
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.punishment.count(),
    prisma.examSession.count({ where: { status: "ONGOING" } }),
  ]);
  return { characters, tickets, applications, punishments, activeExams };
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-6">
      <p className="label-eyebrow mb-2">{label}</p>
      <p className="font-display text-4xl text-brass">{value}</p>
    </div>
  );
}

export default async function OverviewPage() {
  const stats = await getStats();

  return (
    <div>
      <p className="label-eyebrow mb-2">Przegląd</p>
      <h1 className="font-display text-3xl mb-8">Stan serwera</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Postacie w bazie" value={stats.characters} />
        <StatCard label="Otwarte tickety" value={stats.tickets} />
        <StatCard label="Podania do rozpatrzenia" value={stats.applications} />
        <StatCard label="Kary dyscyplinarne (łącznie)" value={stats.punishments} />
        <StatCard label="Trwające egzaminy" value={stats.activeExams} />
      </div>
    </div>
  );
}
