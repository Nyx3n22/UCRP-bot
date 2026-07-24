import { prisma } from "@/lib/prisma";
import { createFaculty, deleteFaculty } from "./actions";

export default async function FacultiesPage() {
  const faculties = await prisma.faculty.findMany({
    include: { _count: { select: { characters: true, subjects: true, roleBindings: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <p className="label-eyebrow mb-2">Fundament</p>
      <h1 className="font-display text-3xl mb-2">Wydziały</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Zacznij tutaj, zanim dodasz cokolwiek innego — przedmioty (zakładka Egzaminy) i przypisania kadry do
        wydziału (zakładka Role) wymagają, żeby wydział już istniał.
      </p>

      <div className="card p-6 mb-8 max-w-md">
        <h2 className="font-display text-lg mb-4">Nowy wydział</h2>
        <form action={createFaculty} className="flex gap-3 items-end">
          <input name="name" required placeholder="np. Wydział Fizyki" className="flex-1" />
          <button type="submit" className="btn-primary">Dodaj</button>
        </form>
      </div>

      <table className="uwrp-table max-w-2xl">
        <thead>
          <tr>
            <th>Nazwa</th>
            <th>Postacie</th>
            <th>Przedmioty</th>
            <th>Powiązania ról</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {faculties.map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td>{f._count.characters}</td>
              <td>{f._count.subjects}</td>
              <td>{f._count.roleBindings}</td>
              <td>
                <form action={deleteFaculty}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="btn-danger text-xs" title="Nie usunie się, jeśli są powiązane dane">
                    Usuń
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {faculties.length === 0 && (
            <tr><td colSpan={5} className="text-center text-parchment/40 py-8">Brak wydziałów — dodaj pierwszy powyżej.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
