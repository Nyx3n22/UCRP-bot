import { prisma } from "@/lib/prisma";

export default async function CharactersPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();

  const characters = await prisma.character.findMany({
    where: q
      ? {
          OR: [
            { firstNameIC: { contains: q, mode: "insensitive" } },
            { lastNameIC: { contains: q, mode: "insensitive" } },
            { pesel: { contains: q } },
            { albumNumber: { contains: q } },
          ],
        }
      : undefined,
    include: { faculty: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <p className="label-eyebrow mb-2">Baza danych</p>
      <h1 className="font-display text-3xl mb-6">Postacie</h1>

      <form className="mb-6">
        <input
          name="q"
          defaultValue={q}
          placeholder="Szukaj po imieniu, nazwisku, PESEL lub nr albumu…"
          className="w-96"
        />
      </form>

      <table className="uwrp-table">
        <thead>
          <tr>
            <th>Imię i nazwisko</th>
            <th>Discord</th>
            <th>Roblox</th>
            <th>Wydział</th>
            <th>Rok</th>
            <th>Nr albumu</th>
            <th>PESEL</th>
          </tr>
        </thead>
        <tbody>
          {characters.map((c) => (
            <tr key={c.id}>
              <td>{c.firstNameIC} {c.lastNameIC}</td>
              <td className="font-mono text-xs">{c.userId}</td>
              <td>{c.user.robloxUsername ?? "—"}</td>
              <td>{c.faculty?.name ?? "—"}</td>
              <td>{c.yearOfStudy ?? "—"}</td>
              <td className="font-mono text-xs">{c.albumNumber}</td>
              <td className="font-mono text-xs">{c.pesel}</td>
            </tr>
          ))}
          {characters.length === 0 && (
            <tr><td colSpan={7} className="text-center text-parchment/40 py-8">Brak wyników.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
