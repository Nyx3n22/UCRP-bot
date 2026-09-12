import { prisma } from "@/lib/prisma";
import { fetchGuildRoles } from "@/lib/discord";
import { PERMISSION_KEYS, groupPermissionKeys } from "@/lib/permissionKeys";
import { STAFF_CATEGORIES } from "@/lib/permissionHierarchy";
import { groupRolesByCategory, UNCATEGORIZED_LABEL } from "@/lib/roleCategories";
import { createRoleBinding, deleteRoleBinding } from "./actions";

const HIERARCHY_CHAINS = [
  "Holder Projektu → Manager Projektu → Pomocnik Managera",
  "Główny Developer → Developer → Młodszy Developer",
  "Opiekun Administracji → Starszy Administrator → Administrator → Młodszy Administrator → Starszy Moderator → Moderator → Młodszy Moderator",
  "Support → Trial Support (osobny łańcuch — Support nie dziedziczy po Moderacji)",
];

export default async function RolesPage() {
  const [bindings, roles, faculties] = await Promise.all([
    prisma.roleBinding.findMany({ include: { faculty: true } }),
    fetchGuildRoles(),
    prisma.faculty.findMany({ orderBy: { name: "asc" } }),
  ]);

  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const { groups, dividers, uncategorized } = groupRolesByCategory(roles);
  const permissionGroups = groupPermissionKeys();

  // Do powiązania idą role z kategorii nadawalnych (przegródki są odfiltrowane
  // w groupRolesByCategory, a kategorie z assignable=false — np. boty — pomijamy).
  const bindableGroups = groups.filter((g) => g.assignable);
  const bindableRolesCount = bindableGroups.reduce((sum, g) => sum + g.roles.length, 0) + uncategorized.length;

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

      {/* ---------- dziedziczenie + przegródki ---------- */}
      <div className="card p-6 mb-8 max-w-3xl">
        <h2 className="font-display text-lg mb-3">Hierarchia rang (dziedziczenie)</h2>
        <p className="text-parchment/60 text-sm mb-3">
          Wyższa ranga dostaje wszystkie uprawnienia rang niższych, więc zwykle wystarczy powiązać rolę z jedną
          rangą. Uprawnienia granularne (kick, ban, timeout…) są przypisywane do rang automatycznie — możesz też
          nadać je wybranej roli wprost, z pominięciem hierarchii.
        </p>
        <ul className="text-sm text-parchment/70 list-disc pl-5 space-y-1">
          {HIERARCHY_CHAINS.map((chain) => (
            <li key={chain}>{chain}</li>
          ))}
        </ul>

        <div className="mt-5 border-t border-parchment/10 pt-4">
          <h3 className="font-display text-base mb-2">Przegródki (role nienadawalne)</h3>
          <p className="text-parchment/60 text-sm mb-3">
            Przegródki — role o nazwie <code>•══════• Kategoria •══════•</code> — dzielą listę ról na serwerze, ale
            są wyłącznie wizualne: nie mają uprawnień, nie są nadawane ludziom i nie mogą dostać powiązania.
            Poniżej wykryte na serwerze ({dividers.length}):
          </p>
          {dividers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {dividers.map((d) => (
                <span key={d.id} className="text-xs px-2 py-1 rounded bg-parchment/5 text-parchment/40 line-through">
                  {d.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-parchment/40">
              Nie wykryto przegródek (albo nie udało się pobrać ról). Oczekiwane kategorie:{" "}
              {STAFF_CATEGORIES.map((c) => c.label).join(", ")}.
            </p>
          )}
        </div>
      </div>

      {/* ---------- formularz ---------- */}
      <div className="card p-6 mb-8 max-w-2xl">
        <h2 className="font-display text-lg mb-4">Dodaj powiązanie</h2>
        <form action={createRoleBinding} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Rola na serwerze (przegródki są pominięte)</label>
            <select name="discordRoleId" required>
              <option value="">Wybierz rolę…</option>
              {bindableGroups.map((g) => (
                <optgroup key={g.key} label={g.known ? `Kategoria: ${g.label}` : g.label}>
                  {g.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {uncategorized.length > 0 && (
                <optgroup label={UNCATEGORIZED_LABEL}>
                  {uncategorized.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Uprawnienie</label>
            <select name="permissionKey" required>
              <option value="">Wybierz uprawnienie…</option>
              {permissionGroups.map(({ group, entries }) => (
                <optgroup key={group} label={group}>
                  {entries.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} ({p.key})
                    </option>
                  ))}
                </optgroup>
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
              {faculties.map((f: any) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">
              Rok studiów (tylko gdy uprawnienie = STUDY_YEAR_ROLE, np. rola "Student Pierwszego Roku" → 1)
            </label>
            <input name="studyYear" type="number" min={1} max={8} placeholder="np. 1" className="w-32" />
          </div>
          <button type="submit" className="btn-primary self-start">Dodaj powiązanie</button>
        </form>
        <p className="text-xs text-parchment/40 mt-3">
          W sumie {PERMISSION_KEYS.length} kluczy uprawnień i {bindableRolesCount} ról możliwych do powiązania
          (pominięto {dividers.length} przegródek
          {groups.length > bindableGroups.length ? " i kategorie nienadawalne, np. boty" : ""}).
        </p>
      </div>

      {/* ---------- tabela powiązań ---------- */}
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
          {bindings.map((b: any) => (
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
