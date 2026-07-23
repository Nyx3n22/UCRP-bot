import { prisma } from "@/lib/prisma";
import { fetchGuildRoles } from "@/lib/discord";
import { PERMISSION_KEYS } from "@/lib/permissionKeys";
import { createRoleBinding, deleteRoleBinding } from "./actions";

export default async function RolesPage() {
  const [bindings, roles, faculties] = await Promise.all([
    prisma.roleBinding.findMany({ include: { faculty: true } }),
    fetchGuildRoles(),
    prisma.faculty.findMany({ orderBy: { name: "asc" } }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

  return (
    <div>
      <p className="label-eyebrow mb-2">Konfiguracja</p>
      <h1 className="font-display text-3xl mb-2">Role i uprawnienia</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        To jest jedyne miejsce, w którym nadajesz uprawnienia — zarówno do Dashboardu, jak i do komend bota na
        Discordzie (jeden punkt prawdy, ten sam mechanizm po obu stronach). Jeśli lista ról poniżej jest pusta,
        sprawdź czy <code>DISCORD_BOT_TOKEN</code> i <code>GUILD_ID</code> w zmiennych środowiskowych są poprawne.
      </p>

      {roles.length === 0 && (
        <div className="card p-4 mb-6 border-burgundy text-sm">
          ⚠️ Nie udało się pobrać listy ról z Discorda. Sprawdź zmienne środowiskowe <code>DISCORD_BOT_TOKEN</code>{" "}
          i <code>GUILD_ID</code> w ustawieniach usługi na Render.
        </div>
      )}

      <div className="card p-6 mb-8 max-w-2xl">
        <h2 className="font-display text-lg mb-4">Dodaj powiązanie</h2>
        <form action={createRoleBinding} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Rola na serwerze</label>
            <select name="discordRoleId" required>
              <option value="">Wybierz rolę…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Uprawnienie</label>
            <select name="permissionKey" required>
              <option value="">Wybierz uprawnienie…</option>
              {PERMISSION_KEYS.map((p) => (
                <option key={p.key} value={p.key}>{p.label} ({p.key})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Etykieta (widoczna np. jako prefix tytułu naukowego)</label>
            <input name="label" required placeholder="np. Dziekanat, Dr hab., Moderator" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Wydział (tylko dla ról kadry przypisanej do wydziału - opcjonalnie)</label>
            <select name="facultyId">
              <option value="">— brak —</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary self-start">Dodaj powiązanie</button>
        </form>
      </div>

      <table className="uwrp-table max-w-3xl">
        <thead>
          <tr>
            <th>Rola</th>
            <th>Uprawnienie</th>
            <th>Etykieta</th>
            <th>Wydział</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((b) => (
            <tr key={b.id}>
              <td>{roleNameById.get(b.discordRoleId) ?? <span className="font-mono text-xs text-parchment/40">{b.discordRoleId} (rola usunięta?)</span>}</td>
              <td className="text-brass text-xs">{b.permissionKey}</td>
              <td>{b.label}</td>
              <td>{b.faculty?.name ?? "—"}</td>
              <td>
                <form action={deleteRoleBinding}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="btn-danger text-xs">Usuń</button>
                </form>
              </td>
            </tr>
          ))}
          {bindings.length === 0 && (
            <tr><td colSpan={5} className="text-center text-parchment/40 py-8">Brak powiązań.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
