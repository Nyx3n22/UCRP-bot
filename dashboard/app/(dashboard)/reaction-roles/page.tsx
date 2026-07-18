import { prisma } from "@/lib/prisma";
import { createGroup, addOption, deleteOption, deleteGroup } from "./actions";

const STYLES = ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"];

export default async function ReactionRolesPage() {
  const groups = await prisma.reactionRoleGroup.findMany({
    include: { options: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <p className="label-eyebrow mb-2">Konfiguracja</p>
      <h1 className="font-display text-3xl mb-2">Autorole</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Zdefiniuj grupę, dodaj opcje (rola + etykieta przycisku), a następnie na Discordzie użyj{" "}
        <code>/autorole panel [klucz_grupy]</code>, żeby opublikować panel na wybranym kanale.
      </p>

      <details className="card p-4 mb-8 max-w-xl">
        <summary className="cursor-pointer text-sm text-brass">+ Nowa grupa</summary>
        <form action={createGroup} className="flex flex-col gap-2 mt-3">
          <input name="key" placeholder="Klucz (np. wydzialy)" required />
          <input name="title" placeholder="Tytuł panelu" required />
          <textarea name="description" rows={2} placeholder="Opis (opcjonalnie)" />
          <button type="submit" className="btn-primary text-sm self-start">Utwórz grupę</button>
        </form>
      </details>

      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <div key={g.id} className="card p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-brass font-mono">{g.key}</p>
                <h2 className="font-display text-xl">{g.title}</h2>
                {g.description && <p className="text-sm text-parchment/60 mt-1">{g.description}</p>}
              </div>
              <form action={deleteGroup}>
                <input type="hidden" name="id" value={g.id} />
                <button type="submit" className="btn-danger text-xs">Usuń grupę</button>
              </form>
            </div>

            <table className="uwrp-table mb-4">
              <thead>
                <tr>
                  <th>Kolejność</th>
                  <th>Etykieta</th>
                  <th>ID roli</th>
                  <th>Emoji</th>
                  <th>Styl</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.options.map((o) => (
                  <tr key={o.id}>
                    <td>{o.order}</td>
                    <td>{o.label}</td>
                    <td className="font-mono text-xs">{o.discordRoleId}</td>
                    <td>{o.emoji ?? "—"}</td>
                    <td>{o.style}</td>
                    <td>
                      <form action={deleteOption}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="btn-danger text-xs">Usuń</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {g.options.length === 0 && (
                  <tr><td colSpan={6} className="text-parchment/40 text-center py-4">Brak opcji.</td></tr>
                )}
              </tbody>
            </table>

            <form action={addOption} className="flex flex-wrap gap-2 items-end">
              <input type="hidden" name="groupId" value={g.id} />
              <input name="label" placeholder="Etykieta" required className="w-40" />
              <input name="discordRoleId" placeholder="ID roli" required className="w-40" />
              <input name="emoji" placeholder="Emoji (opcjonalnie)" className="w-28" />
              <select name="style" defaultValue="SECONDARY">
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input name="order" type="number" placeholder="Kolejność" className="w-24" />
              <button type="submit" className="btn-primary text-sm">Dodaj opcję</button>
            </form>
          </div>
        ))}
        {groups.length === 0 && <p className="text-parchment/40">Brak grup — utwórz pierwszą powyżej.</p>}
      </div>
    </div>
  );
}
