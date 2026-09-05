import { prisma } from "@/lib/prisma";
import { runPayout } from "./actions";

export default async function StypendiaPage() {
  const [faculties, recentScholarships] = await Promise.all([
    prisma.faculty.findMany({ orderBy: { name: "asc" } }),
    prisma.scholarship.findMany({ orderBy: { issuedAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <p className="label-eyebrow mb-2">Dziekanat</p>
      <h1 className="font-display text-3xl mb-2">Stypendia</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Wypłaca stypendium wszystkim studentom danego wydziału ze średnią ocen ≥ progu. Wynik zostanie ogłoszony jako
        embed na kanale skonfigurowanym pod kluczem <code>STYPENDIUM</code> w zakładce Kanały. Zastępuje dawną
        komendę <code>/stypendium wyplac</code>.
      </p>

      <form action={runPayout} className="card p-5 flex flex-col gap-3 max-w-md mb-10">
        <select name="facultyId" required>
          <option value="">Wybierz wydział...</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <label className="text-xs text-parchment/60">
          Minimalne GPA (domyślnie 4.5)
          <input type="number" step="0.01" name="minGpa" placeholder="4.5" />
        </label>
        <label className="text-xs text-parchment/60">
          Kwota IC (domyślnie 1500)
          <input type="number" name="amountIC" placeholder="1500" />
        </label>
        <button type="submit" className="btn-primary text-xs self-start">
          🎓 Wypłać stypendia
        </button>
      </form>

      <h2 className="font-display text-xl mb-3">Ostatnio wypłacone</h2>
      <div className="flex flex-col gap-2">
        {recentScholarships.map((s) => (
          <div key={s.id} className="card p-3 text-sm flex justify-between">
            <span className="font-mono text-xs">{s.userId} — GPA {s.gpaAtIssue.toFixed(2)} — {s.amountIC} IC</span>
            <span className="text-parchment/40 text-xs">{s.issuedAt.toLocaleDateString("pl-PL")}</span>
          </div>
        ))}
        {recentScholarships.length === 0 && <p className="text-parchment/40 text-sm">Brak wypłat.</p>}
      </div>
    </div>
  );
}
