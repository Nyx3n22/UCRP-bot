import { prisma } from "@/lib/prisma";
import { fetchGuildRoles } from "@/lib/discord";
import { createLevelRoleReward, deleteLevelRoleReward } from "./actions";

export default async function LevelRolesPage() {
  const [rewards, roles] = await Promise.all([
    prisma.levelRoleReward.findMany({ orderBy: { level: "asc" } }),
    fetchGuildRoles(),
  ]);
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

  return (
    <div>
      <p className="label-eyebrow mb-2">System poziomów</p>
      <h1 className="font-display text-3xl mb-2">Nagrody za poziom</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Rola nadawana automatycznie, gdy użytkownik osiągnie dany poziom w <code>/level</code> (XP za wiadomości i
        czas na kanałach głosowych). Jeden poziom = jedna rola; zapisanie kolejnej roli dla tego samego poziomu
        nadpisuje poprzednią.
      </p>

      <form action={createLevelRoleReward} className="card p-4 flex items-center gap-3 mb-8 max-w-xl">
        <input type="number" name="level" min={1} placeholder="Poziom" required className="w-24" />
        <select name="roleId" required className="flex-1">
          <option value="">Wybierz rolę…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary text-xs">
          Zapisz
        </button>
      </form>

      <table className="uwrp-table max-w-xl">
        <thead>
          <tr>
            <th>Poziom</th>
            <th>Rola</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rewards.map((r) => (
            <tr key={r.id}>
              <td>{r.level}</td>
              <td>{roleNameById.get(r.roleId) ?? r.roleId}</td>
              <td>
                <form action={deleteLevelRoleReward}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn-danger text-xs">
                    Usuń
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {rewards.length === 0 && (
            <tr>
              <td colSpan={3} className="text-parchment/40 text-sm py-4">
                Brak skonfigurowanych nagród. Dodaj pierwszą powyżej.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
