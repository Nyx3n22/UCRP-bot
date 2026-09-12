/**
 * lib/permissionHierarchy.ts
 *
 * RĘCZNIE UTRZYMYWANA KOPIA modelu uprawnień z bot/src/config/roles.js
 * (dwa osobne projekty TS/JS — nie ma wspólnego pakietu, więc nie da się
 * po prostu zaimportować pliku bota). bot/test/permissions.test.js
 * porównuje oba pliki i FAILUJE, jeśli się rozjadą — po zmianie w jednym
 * miejscu popraw drugie i uruchom `cd bot && npm test`.
 *
 * Zasada działania: efektywne uprawnienia użytkownika = domknięcie
 * przechodnie jego kluczy z RoleBinding po relacji IMPLIES złożonej z:
 *   RANK_HIERARCHY      ranga -> rangi niższe (dziedziczenie)
 *   RANK_GRANTS         ranga -> uprawnienia granularne „z urzędu"
 *   RANK_LEGACY_GRANTS  ranga -> stare klucze (np. MODERATOR -> MODERATE)
 *   LEGACY_COMPAT       stary klucz -> nowe (np. MODERATE -> BAN_MEMBERS)
 *
 * UWAGA: format tego pliku (jedna para `KLUCZ: [...]` na wpis) jest
 * parsowany po stronie bota w teście — nie rozbijaj wpisów na wiele linii
 * w sposób, który psuje dopasowanie `KLUCZ: [...]`.
 */

export type StaffCategory = {
  key: string;
  label: string;
  /** Czy role z tej kategorii mogą dostać powiązanie (RoleBinding). */
  assignable: boolean;
  /** Klucze rang przypisane do kategorii (kolejność: góra -> dół na Discordzie). */
  ranks: string[];
  /** Nazwy ról, które nie leżą pod żadną przegródką, a i tak należą do kategorii. */
  standaloneRoles?: string[];
};

/**
 * Kategorie ról na serwerze głównym (GUILD_ID). Każda jest na Discordzie
 * poprzedzona „przegródką" — rolą separatorem `•══════• <Kategoria> •══════•`.
 * Przegródki są wyłącznie wizualne: nie mają uprawnień, nie są nadawane
 * ludziom i NIGDY nie trafiają do RoleBinding.
 *
 * To NIE jest system ról Kół Naukowych (Kolo.roleIdDivider na serwerze
 * KOLA_GUILD_ID) — tamten to osobny mechanizm na osobnym serwerze.
 */
export const STAFF_CATEGORIES: StaffCategory[] = [
  { key: "DEVELOPMENT", label: "Development", assignable: true, ranks: ["GLOWNY_DEVELOPER", "DEVELOPER", "MLODSZY_DEVELOPER"] },
  { key: "ADMINISTRACJA", label: "Administracja", assignable: true, ranks: ["OPIEKUN_ADMINISTRACJI", "STARSZY_ADMINISTRATOR", "ADMINISTRATOR", "MLODSZY_ADMINISTRATOR"] },
  { key: "MODERACJA", label: "Moderacja", assignable: true, ranks: ["STARSZY_MODERATOR", "MODERATOR", "MLODSZY_MODERATOR"] },
  { key: "SUPPORT", label: "Support", assignable: true, ranks: ["SUPPORT", "TRIAL_SUPPORT"] },
  { key: "SAMODZIELNE", label: "Samodzielne", assignable: true, ranks: [], standaloneRoles: ["• Zawieszony •", "• Urlop •"] },
  { key: "PRZYDZIAL", label: "Przydział", assignable: true, ranks: [] },
  { key: "HOLDER", label: "Holder", assignable: true, ranks: ["HOLDER_PROJECTU"] },
  { key: "MANAGER", label: "Manager", assignable: true, ranks: ["MANAGER_PROJEKTU", "POMOCNIK_MANAGERA"] },
  { key: "ZARZAD_PROJEKTU", label: "Zarząd Projektu", assignable: true, ranks: ["ZARZAD_PROJEKTU"] },
  { key: "BOT", label: "Bot", assignable: false, ranks: [] }, // • Uniwersytet Centralny Bot •, • Bot •
];

/** Dokładna nazwa przegródki dla kategorii (jak na Discordzie). */
export function dividerRoleName(label: string): string {
  return `•══════• ${label} •══════•`;
}

/** Wykrywa przegródkę po nazwie: `•══════• Cokolwiek •══════•`. */
export function isDividerRoleName(name: string | null | undefined): boolean {
  if (typeof name !== "string") return false;
  return /^•═+•\s*.+\s*•═+•$/.test(name.trim());
}

/** Wyciąga nazwę kategorii z nazwy przegródki (`•══════• X •══════•` -> `X`). */
export function dividerCategoryLabel(name: string): string {
  return name.replace(/•/g, "").replace(/═/g, "").trim();
}

export const DIVIDER_ROLES: string[] = STAFF_CATEGORIES.map((c) => dividerRoleName(c.label));

/** ranga -> rangi niższe (wyższa ranga dostaje wszystko, co mają niższe) */
export const RANK_HIERARCHY: Record<string, string[]> = {
  // zarząd projektu
  HOLDER_PROJECTU: ["MANAGER_PROJEKTU"],
  MANAGER_PROJEKTU: ["POMOCNIK_MANAGERA"],
  POMOCNIK_MANAGERA: [],
  ZARZAD_PROJEKTU: [],
  // development
  GLOWNY_DEVELOPER: ["DEVELOPER"],
  DEVELOPER: ["MLODSZY_DEVELOPER"],
  MLODSZY_DEVELOPER: [],
  // administracja + moderacja (jeden ciągły łańcuch)
  OPIEKUN_ADMINISTRACJI: ["STARSZY_ADMINISTRATOR"],
  STARSZY_ADMINISTRATOR: ["ADMINISTRATOR"],
  ADMINISTRATOR: ["MLODSZY_ADMINISTRATOR"],
  MLODSZY_ADMINISTRATOR: ["STARSZY_MODERATOR"],
  STARSZY_MODERATOR: ["MODERATOR"],
  MODERATOR: ["MLODSZY_MODERATOR"],
  MLODSZY_MODERATOR: [],
  // support (osobny łańcuch — Support nie dziedziczy po Moderacji)
  SUPPORT: [],
  TRIAL_SUPPORT: [],
};

/** ranga -> uprawnienia granularne nadawane „z urzędu" (tylko „nowość" danej rangi) */
export const RANK_GRANTS: Record<string, string[]> = {
  HOLDER_PROJECTU: ["MANAGE_ROLES"],
  MANAGER_PROJEKTU: ["MANAGE_CHANNELS"],
  POMOCNIK_MANAGERA: ["VIEW_AUDIT_LOG"],
  ZARZAD_PROJEKTU: ["VIEW_AUDIT_LOG"],
  GLOWNY_DEVELOPER: ["MANAGE_ROLES"],
  DEVELOPER: ["MANAGE_CHANNELS", "MANAGE_THREADS"],
  MLODSZY_DEVELOPER: ["VIEW_AUDIT_LOG"],
  OPIEKUN_ADMINISTRACJI: [],
  STARSZY_ADMINISTRATOR: [],
  ADMINISTRATOR: ["MANAGE_ROLES"],
  MLODSZY_ADMINISTRATOR: ["MANAGE_CHANNELS"],
  STARSZY_MODERATOR: ["BAN_MEMBERS", "MOVE_MEMBERS"],
  MODERATOR: ["KICK_MEMBERS"],
  MLODSZY_MODERATOR: ["TIMEOUT_MEMBERS", "CLEAR_MESSAGES", "VIEW_AUDIT_LOG", "MANAGE_THREADS", "MANAGE_NICKNAMES"],
  SUPPORT: ["MANAGE_THREADS", "VIEW_AUDIT_LOG", "CLEAR_MESSAGES"],
  TRIAL_SUPPORT: ["MANAGE_THREADS"],
};

/**
 * ranga -> stare klucze (żeby istniejące odwołania w kodzie nadal działały).
 * Tylko SZCZYTY łańcuchów: wpisanie np. MANAGER_PROJEKTU -> MANAGE_PROJECT
 * dałoby (przez LEGACY_COMPAT) Managerowi uprawnienia Holdera, czyli awans
 * w górę hierarchii.
 */
export const RANK_LEGACY_GRANTS: Record<string, string[]> = {
  HOLDER_PROJECTU: ["MANAGE_PROJECT"],
  GLOWNY_DEVELOPER: ["MANAGE_TECH"],
  SUPPORT: ["REVIEW_APPLICATIONS"],
};

/**
 * stary klucz -> nowe klucze (kompatybilność wstecz dla istniejących wpisów
 * RoleBinding).
 *
 * ŚWIADOMIE BEZ RANG: gdyby MODERATE implikował np. MODERATOR, to Młodszy
 * Moderator (który dziedziczy po MODERATE przez RANK_LEGACY_GRANTS) awansowałby
 * sobie do Starszego Moderatora i hierarchia przestałaby cokolwiek znaczyć.
 * Dlatego MODERATE daje wyłącznie uprawnienia granularne, a sprawdzenia, które
 * muszą działać w obu światach, pytają o kilka kluczy naraz — patrz
 * `hasAnyPermission(discordId, ["MODERATE", "MLODSZY_MODERATOR"])`.
 *
 * DASHBOARD_ACCESS celowo NIE implikuje niczego — to jedyny klucz, który
 * trzeba nadać wprost, żeby w ogóle wejść do panelu.
 */
export const LEGACY_COMPAT: Record<string, string[]> = {
  MODERATE: ["KICK_MEMBERS", "BAN_MEMBERS", "TIMEOUT_MEMBERS", "CLEAR_MESSAGES", "MANAGE_THREADS", "MANAGE_NICKNAMES", "MOVE_MEMBERS", "VIEW_AUDIT_LOG"],
  MANAGE_TECH: ["GLOWNY_DEVELOPER", "MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_THREADS", "VIEW_AUDIT_LOG"],
  MANAGE_PROJECT: ["HOLDER_PROJECTU", "ZARZAD_PROJEKTU", "MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_THREADS", "VIEW_AUDIT_LOG"],
  MANAGE_DEANERY: ["VIEW_AUDIT_LOG", "MANAGE_NICKNAMES", "MANAGE_CHANNELS", "MANAGE_THREADS"],
  REVIEW_APPLICATIONS: ["VIEW_AUDIT_LOG"],
};

/** Złożona relacja: klucz -> klucze, które też „ma" jego posiadacz. */
export const IMPLIES: Record<string, string[]> = (() => {
  const merged: Record<string, string[]> = {};
  const add = (from: string, targets: string[]) => {
    if (!merged[from]) merged[from] = [];
    merged[from].push(...targets);
  };
  for (const [rank, lower] of Object.entries(RANK_HIERARCHY)) add(rank, lower);
  for (const [rank, grants] of Object.entries(RANK_GRANTS)) add(rank, grants);
  for (const [rank, legacy] of Object.entries(RANK_LEGACY_GRANTS)) add(rank, legacy);
  for (const [legacy, keys] of Object.entries(LEGACY_COMPAT)) add(legacy, keys);
  return merged;
})();

/** Domknięcie przechodnie zbioru kluczy po IMPLIES. */
export function expandPermissionKeys(keys: Iterable<string>): Set<string> {
  const result = new Set<string>();
  const stack = [...keys];
  while (stack.length > 0) {
    const key = stack.pop();
    if (!key || result.has(key)) continue;
    result.add(key);
    for (const next of IMPLIES[key] ?? []) {
      if (!result.has(next)) stack.push(next);
    }
  }
  return result;
}
