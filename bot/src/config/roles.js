/**
 * config/roles.js
 *
 * Zamiast hardkodować ID ról, kod operuje na „kluczach uprawnień".
 * Faktyczne powiązanie klucz -> ID roli na Discordzie jest w tabeli
 * RoleBinding, edytowalnej z Dashboardu.
 *
 * Klucze tworzą HIERARCHIĘ: ranga wyższa dziedziczy uprawnienia rang
 * niższych, więc w Dashboardzie wystarczy powiązać rolę Discorda z jedną
 * rangą (np. „• Starszy Moderator •" -> STARSZY_MODERATOR), a reszta
 * wynika z dziedziczenia i domyślnych grantów (RANK_GRANTS).
 *
 * Trzy relacje składają się na jedną wspólną tablicę IMPLIES:
 *   RANK_HIERARCHY      ranga -> rangi niższe (dziedziczenie)
 *   RANK_GRANTS         ranga -> uprawnienia granularne, które dostaje „z urzędu"
 *   RANK_LEGACY_GRANTS  ranga -> stare klucze (np. MODERATOR -> MODERATE),
 *                       żeby istniejące odwołania w kodzie nadal działały
 *   LEGACY_COMPAT       stary klucz -> nowe (np. MODERATE -> BAN_MEMBERS),
 *                       żeby istniejące wpisy RoleBinding nadal działały
 *
 * Efektywne uprawnienia członka = domknięcie przechodnie jego kluczy
 * po IMPLIES. Dzięki temu `hasPermission(member, "BAN_MEMBERS")` jest
 * prawdą zarówno dla kogoś ze starą rolą MODERATE, jak i dla Starszego
 * Moderatora (przez hierarchię), jak i dla roli, której w Dashboardzie
 * przyznano BAN_MEMBERS wprost.
 *
 * UWAGA (sync!): dashboard/lib/permissionKeys.ts oraz
 * dashboard/lib/permissionHierarchy.ts to RĘCZNIE utrzymywane kopie tego
 * modelu po stronie TypeScript (dwa osobne projekty, nie ma wspólnego
 * pakietu). bot/test/permissions.test.js pilnuje, żeby się nie rozjechały.
 *
 * Cache w pamięci odświeżany co 60s, żeby nie odpytywać bazy przy
 * każdej interakcji.
 */

const prisma = require("../lib/prisma");

// ---------------------------------------------------------------------------
// 1) KLUCZE UPRAWNIEŃ
// ---------------------------------------------------------------------------

const PERMISSION_KEYS = {
  // --- istniejące (zachowane dla kompatybilności) ---
  MANAGE_PROJECT: "MANAGE_PROJECT",
  MANAGE_TECH: "MANAGE_TECH",
  DASHBOARD_ACCESS: "DASHBOARD_ACCESS", // pełny dostęp do panelu Web Dashboard
  MODERATE: "MODERATE", // LEGACY: „może moderować" — patrz LEGACY_COMPAT
  MANAGE_EVENTS: "MANAGE_EVENTS",
  DONATE_UNLIMITED_AI: "DONATE_UNLIMITED_AI",
  MANAGE_DEANERY: "MANAGE_DEANERY",
  MANAGE_FACULTY: "MANAGE_FACULTY",
  MANAGE_GRADES: "MANAGE_GRADES",
  MANAGE_EXAMS: "MANAGE_EXAMS",
  MANAGE_SYLLABUS: "MANAGE_SYLLABUS",
  ACADEMIC_TITLE_PREFIX: "ACADEMIC_TITLE_PREFIX",
  REVIEW_APPLICATIONS: "REVIEW_APPLICATIONS",
  MANAGE_REACTION_ROLES: "MANAGE_REACTION_ROLES",
  STUDENT_ROLE: "STUDENT_ROLE",
  WYKLADOWCA_ROLE: "WYKLADOWCA_ROLE",
  ADMINISTRACJA_ROLE: "ADMINISTRACJA_ROLE",
  VERIFIED_ROLE: "VERIFIED_ROLE",
  RECTORATE_ACCESS: "RECTORATE_ACCESS", // Rektor/Prorektor - audyt całej uczelni, nie tylko jednego wydziału
  PARTNERSHIP_MANAGER: "PARTNERSHIP_MANAGER", // osoby odpowiedzialne za rozpatrywanie partnerstw
  STUDY_YEAR_ROLE: "STUDY_YEAR_ROLE", // rola typu „Student Pierwszego Roku" - automatycznie ustawia yearOfStudy

  // --- rangi: zarząd / właściciele projektu ---
  HOLDER_PROJECTU: "HOLDER_PROJECTU", // • Holder Projektu •
  MANAGER_PROJEKTU: "MANAGER_PROJEKTU", // • Manager Projektu •
  POMOCNIK_MANAGERA: "POMOCNIK_MANAGERA", // • Pomocnik Managera Projektu •
  ZARZAD_PROJEKTU: "ZARZAD_PROJEKTU", // • Zarząd Projektu •

  // --- rangi: development ---
  GLOWNY_DEVELOPER: "GLOWNY_DEVELOPER", // • Główny Developer •
  DEVELOPER: "DEVELOPER", // • Developer •
  MLODSZY_DEVELOPER: "MLODSZY_DEVELOPER", // • Młodszy Developer •

  // --- rangi: administracja ---
  OPIEKUN_ADMINISTRACJI: "OPIEKUN_ADMINISTRACJI", // • Opiekun Administracji •
  STARSZY_ADMINISTRATOR: "STARSZY_ADMINISTRATOR", // • Starszy Administrator •
  ADMINISTRATOR: "ADMINISTRATOR", // • Administrator •
  MLODSZY_ADMINISTRATOR: "MLODSZY_ADMINISTRATOR", // • Młodszy Administrator •

  // --- rangi: moderacja ---
  STARSZY_MODERATOR: "STARSZY_MODERATOR", // • Starszy Moderator •
  MODERATOR: "MODERATOR", // • Moderator •
  MLODSZY_MODERATOR: "MLODSZY_MODERATOR", // • Młodszy Moderator •

  // --- rangi: support ---
  SUPPORT: "SUPPORT", // • Support •
  TRIAL_SUPPORT: "TRIAL_SUPPORT", // • Trial Support •

  // --- uprawnienia granularne (odpowiadają uprawnieniom Discorda) ---
  KICK_MEMBERS: "KICK_MEMBERS",
  BAN_MEMBERS: "BAN_MEMBERS",
  TIMEOUT_MEMBERS: "TIMEOUT_MEMBERS",
  CLEAR_MESSAGES: "CLEAR_MESSAGES",
  MANAGE_CHANNELS: "MANAGE_CHANNELS",
  MANAGE_ROLES: "MANAGE_ROLES",
  VIEW_AUDIT_LOG: "VIEW_AUDIT_LOG",
  MANAGE_THREADS: "MANAGE_THREADS",
  MOVE_MEMBERS: "MOVE_MEMBERS",
  MANAGE_NICKNAMES: "MANAGE_NICKNAMES",
};

/** Rangi staffu (klucze, które stoją za konkretną pozycją w hierarchii). */
const RANK_KEYS = [
  PERMISSION_KEYS.HOLDER_PROJECTU,
  PERMISSION_KEYS.MANAGER_PROJEKTU,
  PERMISSION_KEYS.POMOCNIK_MANAGERA,
  PERMISSION_KEYS.ZARZAD_PROJEKTU,
  PERMISSION_KEYS.GLOWNY_DEVELOPER,
  PERMISSION_KEYS.DEVELOPER,
  PERMISSION_KEYS.MLODSZY_DEVELOPER,
  PERMISSION_KEYS.OPIEKUN_ADMINISTRACJI,
  PERMISSION_KEYS.STARSZY_ADMINISTRATOR,
  PERMISSION_KEYS.ADMINISTRATOR,
  PERMISSION_KEYS.MLODSZY_ADMINISTRATOR,
  PERMISSION_KEYS.STARSZY_MODERATOR,
  PERMISSION_KEYS.MODERATOR,
  PERMISSION_KEYS.MLODSZY_MODERATOR,
  PERMISSION_KEYS.SUPPORT,
  PERMISSION_KEYS.TRIAL_SUPPORT,
];

/**
 * Zestawy kluczy używane w wielu miejscach naraz.
 *
 * Zawsze zawierają stary klucz (MODERATE) i najniższą akceptowalną rangę
 * (MLODSZY_MODERATOR) — ranga najniższa „pokrywa" wszystkie wyższe, bo te
 * dziedziczą ją przez RANK_HIERARCHY. Dzięki temu jedno sprawdzenie działa
 * zarówno dla serwera skonfigurowanego starymi wpisami RoleBinding, jak i
 * dla serwera, na którym role są powiązane z rangami.
 */
const KEY_SETS = {
  /** „może moderować" — dowolna ranga moderacyjna albo legacy MODERATE. */
  MODERATION: ["MODERATE", "MLODSZY_MODERATOR"],
  /** rozpatrywanie weryfikacji — Support i wyżej. */
  VERIFICATION_REVIEW: ["MODERATE", "MLODSZY_MODERATOR", "SUPPORT"],
  /** rozpatrywanie podań rekrutacyjnych — rekrutacja, Support, administracja. */
  APPLICATION_REVIEW: ["REVIEW_APPLICATIONS", "SUPPORT", "ADMINISTRATOR"],
  /** obsługa ticketów — Support i wyżej (MANAGE_THREADS pokrywa deweloperów). */
  TICKET_STAFF: ["MODERATE", "MANAGE_THREADS", "SUPPORT"],
};

/** Uprawnienia granularne (nie są rangami — nie dziedziczą po sobie). */
const GRANULAR_KEYS = [
  PERMISSION_KEYS.KICK_MEMBERS,
  PERMISSION_KEYS.BAN_MEMBERS,
  PERMISSION_KEYS.TIMEOUT_MEMBERS,
  PERMISSION_KEYS.CLEAR_MESSAGES,
  PERMISSION_KEYS.MANAGE_CHANNELS,
  PERMISSION_KEYS.MANAGE_ROLES,
  PERMISSION_KEYS.VIEW_AUDIT_LOG,
  PERMISSION_KEYS.MANAGE_THREADS,
  PERMISSION_KEYS.MOVE_MEMBERS,
  PERMISSION_KEYS.MANAGE_NICKNAMES,
];

// ---------------------------------------------------------------------------
// 2) STRUKTURA STAFFU I PRZEGRÓDKI
// ---------------------------------------------------------------------------

/**
 * Kategorie ról odzwierciedlają układ serwera głównego (GUILD_ID).
 * Każda kategoria jest na Discordzie poprzedzona „przegródką" — rolą
 * separatorem o nazwie `•══════• <Kategoria> •══════•`.
 *
 * Przegródki są WYŁĄCZNIE wizualne: nie mają uprawnień, nie są nikomu
 * nadawane i NIGDY nie trafiają do tabeli RoleBinding. Funkcje poniżej
 * (`isDividerRoleName`) służą do ich rozpoznawania po nazwie, żeby
 * Dashboard mógł je odfiltrować z listy ról do powiązania.
 *
 * UWAGA: to NIE jest system ról Kół Naukowych (Kolo.roleIdDivider na
 * serwerze KOLA_GUILD_ID) — tamten żyje w services/koloService.js i jest
 * osobnym mechanizmem na osobnym serwerze.
 */
const STAFF_CATEGORIES = [
  {
    key: "DEVELOPMENT",
    label: "Development",
    assignable: true,
    ranks: [PERMISSION_KEYS.GLOWNY_DEVELOPER, PERMISSION_KEYS.DEVELOPER, PERMISSION_KEYS.MLODSZY_DEVELOPER],
  },
  {
    key: "ADMINISTRACJA",
    label: "Administracja",
    assignable: true,
    ranks: [
      PERMISSION_KEYS.OPIEKUN_ADMINISTRACJI,
      PERMISSION_KEYS.STARSZY_ADMINISTRATOR,
      PERMISSION_KEYS.ADMINISTRATOR,
      PERMISSION_KEYS.MLODSZY_ADMINISTRATOR,
    ],
  },
  {
    key: "MODERACJA",
    label: "Moderacja",
    assignable: true,
    ranks: [PERMISSION_KEYS.STARSZY_MODERATOR, PERMISSION_KEYS.MODERATOR, PERMISSION_KEYS.MLODSZY_MODERATOR],
  },
  {
    key: "SUPPORT",
    label: "Support",
    assignable: true,
    ranks: [PERMISSION_KEYS.SUPPORT, PERMISSION_KEYS.TRIAL_SUPPORT],
  },
  {
    key: "SAMODZIELNE",
    label: "Samodzielne",
    assignable: true,
    ranks: [],
    // Nazwy ról, które nie leżą pod żadną przegródką, ale chcemy je widzieć
    // we własnej kategorii (Dashboard grupuje je po NAZWIE, nie po pozycji).
    standaloneRoles: ["• Zawieszony •", "• Urlop •"],
  },
  { key: "PRZYDZIAL", label: "Przydział", assignable: true, ranks: [] },
  { key: "HOLDER", label: "Holder", assignable: true, ranks: [PERMISSION_KEYS.HOLDER_PROJECTU] },
  {
    key: "MANAGER",
    label: "Manager",
    assignable: true,
    ranks: [PERMISSION_KEYS.MANAGER_PROJEKTU, PERMISSION_KEYS.POMOCNIK_MANAGERA],
  },
  { key: "ZARZAD_PROJEKTU", label: "Zarząd Projektu", assignable: true, ranks: [PERMISSION_KEYS.ZARZAD_PROJEKTU] },
  { key: "BOT", label: "Bot", assignable: false, ranks: [] }, // • Uniwersytet Centralny Bot •, • Bot •
];

/** Nazwa przegródki dla kategorii — dokładnie tak, jak wygląda na Discordzie. */
function dividerRoleName(categoryLabel) {
  return `•══════• ${categoryLabel} •══════•`;
}

/** Wykrywa przegródkę po nazwie: `•══════• Cokolwiek •══════•`. */
function isDividerRoleName(name) {
  if (typeof name !== "string") return false;
  return /^•═+•\s*.+\s*•═+•$/.test(name.trim());
}

/** Przegródka czy nie — przyjmuje nazwę (string) albo obiekt roli Discorda. */
function isDividerRole(roleOrName) {
  if (!roleOrName) return false;
  return isDividerRoleName(typeof roleOrName === "string" ? roleOrName : roleOrName.name);
}

/** Czy rola o tej nazwie może w ogóle dostać powiązanie (RoleBinding)? */
function isAssignableRoleName(name) {
  return !isDividerRoleName(name);
}

const DIVIDER_ROLES = STAFF_CATEGORIES.map((c) => dividerRoleName(c.label));

// ---------------------------------------------------------------------------
// 3) HIERARCHIA — dziedziczenie + domyślne granty
// ---------------------------------------------------------------------------

/** ranga -> rangi niższe (wyższa ranga dostaje wszystko, co mają niższe) */
const RANK_HIERARCHY = {
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

/**
 * ranga -> uprawnienia granularne nadawane „z urzędu".
 * Wartości są DODATKOWE względem tego, co ranga dziedziczy z niższych rang
 * (domknięcie liczy się w IMPLIES), więc tu wpisujemy tylko „nowość" danej rangi.
 */
const RANK_GRANTS = {
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
 * ranga -> stare klucze. Dzięki temu kod, który wciąż pyta o `MODERATE`,
 * działa od razu po przepięciu serwera na rangi (bez przepisywania komend).
 */
const RANK_LEGACY_GRANTS = {
  HOLDER_PROJECTU: ["MANAGE_PROJECT"],
  GLOWNY_DEVELOPER: ["MANAGE_TECH"],
  SUPPORT: ["REVIEW_APPLICATIONS"],
};

/**
 * stary klucz -> nowe klucze (kompatybilność wstecz dla istniejących
 * wpisów RoleBinding: kto miał MODERATE, nadal może banować itd.).
 *
 * ŚWIADOMIE BEZ RANG: gdyby MODERATE implikował np. MODERATOR, to Młodszy
 * Moderator (który dziedziczy po MODERATE przez RANK_LEGACY_GRANTS) awansowałby
 * sobie do Starszego Moderatora i hierarchia przestałaby cokolwiek znaczyć.
 * Dlatego MODERATE daje wyłącznie uprawnienia granularne, a sprawdzenia, które
 * muszą działać w obu światach, pytają o kilka kluczy naraz — patrz
 * `hasAnyPermission(member, ["MODERATE", "MLODSZY_MODERATOR"])`.
 *
 * DASHBOARD_ACCESS celowo NIE implikuje niczego — to jedyny klucz, który
 * trzeba nadać wprost, żeby w ogóle wejść do panelu.
 */
const LEGACY_COMPAT = {
  MODERATE: [
    "KICK_MEMBERS",
    "BAN_MEMBERS",
    "TIMEOUT_MEMBERS",
    "CLEAR_MESSAGES",
    "MANAGE_THREADS",
    "MANAGE_NICKNAMES",
    "MOVE_MEMBERS",
    "VIEW_AUDIT_LOG",
  ],
  MANAGE_TECH: ["GLOWNY_DEVELOPER", "MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_THREADS", "VIEW_AUDIT_LOG"],
  MANAGE_PROJECT: [
    "HOLDER_PROJECTU",
    "ZARZAD_PROJEKTU",
    "MANAGE_CHANNELS",
    "MANAGE_ROLES",
    "MANAGE_THREADS",
    "VIEW_AUDIT_LOG",
  ],
  MANAGE_DEANERY: ["VIEW_AUDIT_LOG", "MANAGE_NICKNAMES", "MANAGE_CHANNELS", "MANAGE_THREADS"],
  REVIEW_APPLICATIONS: ["VIEW_AUDIT_LOG"],
};

/** Złożona tablica relacji: klucz -> klucze, które też „ma" jego posiadacz. */
const IMPLIES = (() => {
  const merged = {};
  const add = (from, targets) => {
    if (!merged[from]) merged[from] = [];
    merged[from].push(...targets);
  };
  for (const [rank, lower] of Object.entries(RANK_HIERARCHY)) add(rank, lower);
  for (const [rank, grants] of Object.entries(RANK_GRANTS)) add(rank, grants);
  for (const [rank, legacy] of Object.entries(RANK_LEGACY_GRANTS)) add(rank, legacy);
  for (const [legacy, keys] of Object.entries(LEGACY_COMPAT)) add(legacy, keys);
  return merged;
})();

/**
 * Domknięcie przechodnie zbioru kluczy po IMPLIES.
 * (Cykle — np. MODERATE -> MLODSZY_MODERATOR -> MODERATE — są dopuszczalne:
 * Set pełni tu rolę zbioru odwiedzonych.)
 */
function expandPermissionKeys(keys) {
  const result = new Set();
  const stack = Array.isArray(keys) ? [...keys] : [keys];
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

const expansionCache = new Map();

/** Dla jednego klucza: zbiór kluczy, które go „spełniają" (odpowiedź na hasPermission). */
function impliedKeysFor(permissionKey) {
  let cached = expansionCache.get(permissionKey);
  if (!cached) {
    cached = expandPermissionKeys([permissionKey]);
    expansionCache.set(permissionKey, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// 4) CACHE POWIĄZAŃ (RoleBinding)
// ---------------------------------------------------------------------------

let cache = { bindings: [], fetchedAt: 0 };
const CACHE_TTL_MS = 60_000;

async function loadBindings() {
  if (Date.now() - cache.fetchedAt < CACHE_TTL_MS && cache.bindings.length > 0) {
    return cache.bindings;
  }
  const bindings = await prisma.roleBinding.findMany();
  cache = { bindings, fetchedAt: Date.now() };
  return bindings;
}

/** Czyści cache powiązań i domknięć (testy + ręczne odświeżenie po zmianach). */
function invalidatePermissionCache() {
  cache = { bindings: [], fetchedAt: 0 };
  expansionCache.clear();
}

// ---------------------------------------------------------------------------
// 5) API
// ---------------------------------------------------------------------------

/** ID ról członka — przyjmuje GuildMember (cache) albo zwykłą tablicę ID/nazw. */
function memberRoleIds(member) {
  if (!member) return [];
  const roles = member.roles;
  if (!roles) return [];
  // discord.js: member.roles.cache -> Collection<id, Role>
  if (typeof roles.cache?.keys === "function") return [...roles.cache.keys()];
  if (Array.isArray(roles)) {
    return roles.map((r) => (typeof r === "string" ? r : r?.id)).filter(Boolean);
  }
  return [];
}

/**
 * Wszystkie klucze uprawnień, które member faktycznie ma — bezpośrednie
 * powiązania ról (RoleBinding) rozszerzone o dziedziczenie hierarchii,
 * domyślne granty rang i kompatybilność ze starymi kluczami.
 */
async function getEffectivePermissionKeys(member) {
  const roleIds = memberRoleIds(member);
  if (roleIds.length === 0) return [];
  const bindings = await loadBindings();
  const owned = new Set(roleIds);
  const directKeys = bindings.filter((b) => owned.has(b.discordRoleId)).map((b) => b.permissionKey);
  return [...expandPermissionKeys(directKeys)];
}

/**
 * @param member GuildMember (discord.js) — albo obiekt z `roles`
 * @param permissionKey klucz z PERMISSION_KEYS
 */
async function hasPermission(member, permissionKey) {
  if (!member || !permissionKey) return false;
  const keys = await getEffectivePermissionKeys(member);
  if (keys.length === 0) return false;
  return keys.includes(permissionKey);
}

/** Prawda, gdy member ma co najmniej jeden z podanych kluczy. */
async function hasAnyPermission(member, permissionKeys) {
  if (!member || !Array.isArray(permissionKeys) || permissionKeys.length === 0) return false;
  const keys = await getEffectivePermissionKeys(member);
  if (keys.length === 0) return false;
  return permissionKeys.some((key) => keys.includes(key));
}

/** Zwraca wiążącą rolę tytułu naukowego (do prefixu nicku), jeśli member ją ma */
async function getScientificTitleBinding(member) {
  const bindings = await loadBindings();
  const titleBindings = bindings.filter((b) => b.permissionKey === PERMISSION_KEYS.ACADEMIC_TITLE_PREFIX);
  return titleBindings.find((b) => member.roles.cache.has(b.discordRoleId)) ?? null;
}

/** Zwraca wiążącą rolę roku studiów (STUDY_YEAR_ROLE), jeśli member ją ma */
async function getStudyYearBinding(member) {
  const bindings = await loadBindings();
  const yearBindings = bindings.filter((b) => b.permissionKey === PERMISSION_KEYS.STUDY_YEAR_ROLE && b.studyYear !== null);
  return yearBindings.find((b) => member.roles.cache.has(b.discordRoleId)) ?? null;
}

/**
 * Zwraca ID pierwszej roli Discord powiązanej z danym kluczem uprawnień
 * (np. do nadania po akceptacji podania).
 *
 * Wołający powinien jeszcze sprawdzić `isDividerRole()` — przegródka
 * („•══════• Kategoria •══════•") nie może zostać nikomu nadana, nawet
 * gdy ktoś powiąże ją w Dashboardzie przez pomyłkę.
 */
async function getRoleIdForPermission(permissionKey) {
  const bindings = await loadBindings();
  const binding = bindings.find((b) => b.permissionKey === permissionKey);
  return binding?.discordRoleId ?? null;
}

module.exports = {
  PERMISSION_KEYS,
  KEY_SETS,
  RANK_KEYS,
  GRANULAR_KEYS,
  STAFF_CATEGORIES,
  DIVIDER_ROLES,
  dividerRoleName,
  isDividerRoleName,
  isDividerRole,
  isAssignableRoleName,
  RANK_HIERARCHY,
  RANK_GRANTS,
  RANK_LEGACY_GRANTS,
  LEGACY_COMPAT,
  IMPLIES,
  expandPermissionKeys,
  impliedKeysFor,
  hasPermission,
  hasAnyPermission,
  getEffectivePermissionKeys,
  getScientificTitleBinding,
  getStudyYearBinding,
  getRoleIdForPermission,
  invalidatePermissionCache,
};
