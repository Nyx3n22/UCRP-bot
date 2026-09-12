/**
 * lib/roleCategories.ts
 *
 * Grupowanie ról Discorda po kategoriach wyznaczonych przez „przegródki"
 * (`•══════• Kategoria •══════•`) oraz wykrywanie ról, których nie wolno
 * wiązać z uprawnieniami (te przegródki właśnie).
 *
 * Logika: `fetchGuildRoles()` zwraca role posortowane po pozycji malejąco
 * (góra listy na Discordzie = najwyższa pozycja). Idziemy więc po liście
 * od góry i każda napotkana przegródka otwiera nową kategorię — role
 * leżące pod nią (aż do kolejnej przegródki) należą do niej. To odzwierciedla
 * to, co administrator widzi w ustawieniach serwera.
 *
 * Odpowiednik po stronie bota: bot/src/config/roles.js (STAFF_CATEGORIES,
 * isDividerRoleName) — oba pliki są porównywane w bot/test/permissions.test.js.
 */

import type { DiscordRole } from "./discord";
import { STAFF_CATEGORIES, dividerCategoryLabel, isDividerRoleName } from "./permissionHierarchy";

export type RoleCategoryGroup = {
  key: string;
  label: string;
  /** Czy role z grupy mogą dostać powiązanie (RoleBinding). */
  assignable: boolean;
  /** Klucze rang przypisane do kategorii (jeśli kategoria jest znana). */
  ranks: string[];
  roles: DiscordRole[];
  /** Rola-przegródka stojąca na czele kategorii (null dla „Pozostałe"). */
  divider: DiscordRole | null;
  /** Czy kategoria jest jedną ze znanych z STAFF_CATEGORIES. */
  known: boolean;
};

export const UNCATEGORIZED_LABEL = "Pozostałe role (poza kategoriami)";

function findCategoryByLabel(label: string) {
  const needle = label.trim().toLowerCase();
  return STAFF_CATEGORIES.find((c) => c.label.toLowerCase() === needle) ?? null;
}

/**
 * Dzieli listę ról na kategorie wyznaczone przez przegródki.
 * Przegródki same w sobie NIE trafiają do żadnej grupy ról do przypisania —
 * są zwracane osobno w `dividers`.
 */
export function groupRolesByCategory(roles: DiscordRole[]): {
  groups: RoleCategoryGroup[];
  dividers: DiscordRole[];
  uncategorized: DiscordRole[];
} {
  const dividers: DiscordRole[] = [];
  const uncategorized: DiscordRole[] = [];
  const detected: RoleCategoryGroup[] = [];

  let current: RoleCategoryGroup | null = null;

  const makeGroup = (category: (typeof STAFF_CATEGORIES)[number] | null, label: string, divider: DiscordRole | null) => ({
    key: category?.key ?? `UNKNOWN_${detected.length + 1}`,
    label: category?.label ?? label,
    assignable: category?.assignable ?? true,
    ranks: category?.ranks ?? [],
    roles: [] as DiscordRole[],
    divider,
    known: Boolean(category),
  });

  for (const role of roles) {
    if (isDividerRoleName(role.name)) {
      dividers.push(role);
      const label = dividerCategoryLabel(role.name);
      current = makeGroup(findCategoryByLabel(label), label, role);
      detected.push(current);
      continue;
    }

    // Role „samodzielne" (np. • Zawieszony •) leżą na liście ról między
    // cudzymi przegródkami, ale kategorię mają przypisaną z nazwy.
    const standalone = STANDALONE_GROUPS.find((g) => g.roleName === role.name);
    if (standalone) {
      const category = STAFF_CATEGORIES.find((c) => c.key === standalone.categoryKey) ?? null;
      let group = detected.find((g) => g.key === standalone.categoryKey);
      if (!group) {
        group = makeGroup(category, category?.label ?? standalone.categoryKey, null);
        detected.push(group);
      }
      group.roles.push(role);
      continue;
    }

    if (current) current.roles.push(role);
    else uncategorized.push(role);
  }

  // Kolejność prezentacji: kanoniczna (jak na serwerze), potem kategorie
  // nieznane, na końcu role sprzed pierwszej przegródki.
  const canonical = STAFF_CATEGORIES.map((c) => detected.find((g) => g.key === c.key)).filter(
    (g): g is RoleCategoryGroup => Boolean(g)
  );
  const unknown = detected.filter((g) => !g.known);

  return { groups: [...canonical, ...unknown], dividers, uncategorized };
}

/**
 * Role, które na Discordzie nie leżą pod żadną przegródką, a i tak mają
 * swoją kategorię (np. „• Zawieszony •") — grupujemy je po NAZWIE, nie po
 * pozycji na liście ról.
 */
const STANDALONE_GROUPS: { roleName: string; categoryKey: string }[] = STAFF_CATEGORIES.flatMap((c) =>
  (c.standaloneRoles ?? []).map((roleName) => ({ roleName, categoryKey: c.key }))
);

/** Role, które można powiązać z uprawnieniem (bez przegródek). */
export function assignableRoles(roles: DiscordRole[]): DiscordRole[] {
  return roles.filter((r) => !isDividerRoleName(r.name));
}
