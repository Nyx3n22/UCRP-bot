import { prisma } from "@/lib/prisma";
import { createResource, deleteResource } from "./actions";

export default async function LibraryPage() {
  const resources = await prisma.libraryResource.findMany({
    include: { loans: { where: { returnedAt: null } } },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <p className="label-eyebrow mb-2">Mechanika RP</p>
      <h1 className="font-display text-3xl mb-2">Biblioteka Akademicka</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Dodaj tu tytuły — dopiero wtedy studenci mogą je wypożyczać komendą <code>/biblioteka wypozycz</code>.
      </p>

      <div className="card p-6 mb-8 max-w-xl">
        <h2 className="font-display text-lg mb-4">Nowy zasób</h2>
        <form action={createResource} className="flex gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-parchment/50">Tytuł</label>
            <input name="title" required placeholder="np. Wstęp do prawa rzymskiego" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Liczba egzemplarzy</label>
            <input name="totalCopies" type="number" defaultValue={1} min={1} className="w-24" />
          </div>
          <button type="submit" className="btn-primary">Dodaj</button>
        </form>
      </div>

      <table className="uwrp-table max-w-2xl">
        <thead>
          <tr>
            <th>Tytuł</th>
            <th>Egzemplarze</th>
            <th>Aktualnie wypożyczone</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.totalCopies}</td>
              <td>{r.loans.length} / {r.totalCopies}</td>
              <td>
                <form action={deleteResource}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn-danger text-xs">Usuń</button>
                </form>
              </td>
            </tr>
          ))}
          {resources.length === 0 && (
            <tr><td colSpan={4} className="text-center text-parchment/40 py-8">Brak zasobów — dodaj pierwszy powyżej.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
