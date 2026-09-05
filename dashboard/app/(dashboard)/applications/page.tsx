import { prisma } from "@/lib/prisma";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "W trakcie",
  ACCEPTED: "Zaakceptowane",
  REJECTED: "Odrzucone",
};

export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <div>
      <p className="label-eyebrow mb-2">Wgląd</p>
      <h1 className="font-display text-3xl mb-2">Podania</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Podania są rozpatrywane przez przyciski Akceptuj/Odrzuć na kanale Discorda (klucz{" "}
        <code>APPLICATIONS_&lt;TYP&gt;</code> w Kanałach) — ta strona jest tylko do wglądu.
      </p>

      <div className="flex flex-col gap-3">
        {applications.map((a: any) => (
          <details key={a.id} className="card p-4">
            <summary className="cursor-pointer flex justify-between items-center">
              <span>
                <span className="text-brass font-mono text-xs mr-2">{a.type}</span>
                <span className="font-mono text-xs text-parchment/40">{a.userId}</span>
              </span>
              <span className="text-sm">{STATUS_LABELS[a.status]} · {a.createdAt.toLocaleDateString("pl-PL")}</span>
            </summary>
            <div className="mt-4 text-sm flex flex-col gap-2">
              {Object.entries(a.answers as Record<string, string>).map(([k, v]) => (
                <p key={k}><span className="text-parchment/50">{k}:</span> {v}</p>
              ))}
              {a.aiAnalysis && (
                <p className="mt-2 text-xs text-brass border-t border-line pt-2">🤖 {a.aiAnalysis}</p>
              )}
            </div>
          </details>
        ))}
        {applications.length === 0 && <p className="text-parchment/40 text-sm">Brak podań.</p>}
      </div>
    </div>
  );
}
