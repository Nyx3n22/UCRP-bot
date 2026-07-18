import { prisma } from "@/lib/prisma";

export default async function LogsPage() {
  const logs = await prisma.actionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <p className="label-eyebrow mb-2">Wgląd</p>
      <h1 className="font-display text-3xl mb-6">Logi akcji</h1>

      <table className="uwrp-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Wykonał</th>
            <th>Akcja</th>
            <th>Cel</th>
            <th>Szczegóły</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="text-xs text-parchment/50 whitespace-nowrap">{l.createdAt.toLocaleString("pl-PL")}</td>
              <td className="font-mono text-xs">{l.actorId}</td>
              <td className="text-brass text-xs">{l.action}</td>
              <td className="font-mono text-xs">{l.targetId ?? "—"}</td>
              <td className="text-xs text-parchment/60 max-w-md truncate">
                {l.metadata ? JSON.stringify(l.metadata) : "—"}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={5} className="text-center text-parchment/40 py-8">Brak zarejestrowanych akcji.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
