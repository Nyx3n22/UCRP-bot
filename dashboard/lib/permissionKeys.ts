/**
 * lib/permissionKeys.ts
 * UWAGA: ta lista musi być ręcznie zsynchronizowana z PERMISSION_KEYS
 * w bot/src/config/roles.js — to dwa osobne projekty TS/JS, więc nie da się
 * po prostu zaimportować jednego pliku w drugim bez wspólnego pakietu.
 * Jeśli dodajesz nowy klucz uprawnienia w kodzie bota, dopisz go i tutaj.
 *
 * bot/test/permissions.test.js porównuje obie listy i FAILUJE, gdy się
 * rozjadą (klucze bez `group` są traktowane jako błąd konfiguracji).
 *
 * `group` służy tylko do grupowania listy w UI (optgroup) — nie wpływa na
 * logikę. Faktyczne dziedziczenie rang jest w lib/permissionHierarchy.ts.
 */

export type PermissionKeyEntry = {
  key: string;
  label: string;
  /** Grupa w UI (optgroup). Wartości: patrz PERMISSION_GROUPS_ORDER. */
  group: string;
  /** Krótki opis pokazywany przy kluczu w podpowiedzi. */
  hint?: string;
};

export const PERMISSION_GROUPS_ORDER = [
  "Zarząd / Development",
  "Rangi — zarząd projektu",
  "Rangi — development",
  "Rangi — administracja",
  "Rangi — moderacja",
  "Rangi — support",
  "Uprawnienia granularne",
  "Uczelnia",
  "Rekrutacja i weryfikacja",
  "Pozostałe",
  "Starsze klucze (legacy)",
];

export const PERMISSION_KEYS: PermissionKeyEntry[] = [
  // ---------- zarząd / development (klucze „techniczne") ----------
  { key: "DASHBOARD_ACCESS", label: "Dostęp do Dashboardu (pełny)", group: "Zarząd / Development", hint: "Jedyny klucz, którego nie da się nadawać z Dashboardu — ustawiany w bazie/seedzie" },
  { key: "MANAGE_PROJECT", label: "Zarząd Projektu (pełne uprawnienia)", group: "Zarząd / Development" },
  { key: "MANAGE_TECH", label: "Administracja Techniczna", group: "Zarząd / Development" },

  // ---------- rangi: zarząd projektu ----------
  { key: "HOLDER_PROJECTU", label: "• Holder Projektu •", group: "Rangi — zarząd projektu" },
  { key: "MANAGER_PROJEKTU", label: "• Manager Projektu •", group: "Rangi — zarząd projektu" },
  { key: "POMOCNIK_MANAGERA", label: "• Pomocnik Managera Projektu •", group: "Rangi — zarząd projektu" },
  { key: "ZARZAD_PROJEKTU", label: "• Zarząd Projektu •", group: "Rangi — zarząd projektu" },

  // ---------- rangi: development ----------
  { key: "GLOWNY_DEVELOPER", label: "• Główny Developer •", group: "Rangi — development" },
  { key: "DEVELOPER", label: "• Developer •", group: "Rangi — development" },
  { key: "MLODSZY_DEVELOPER", label: "• Młodszy Developer •", group: "Rangi — development" },

  // ---------- rangi: administracja ----------
  { key: "OPIEKUN_ADMINISTRACJI", label: "• Opiekun Administracji •", group: "Rangi — administracja" },
  { key: "STARSZY_ADMINISTRATOR", label: "• Starszy Administrator •", group: "Rangi — administracja" },
  { key: "ADMINISTRATOR", label: "• Administrator •", group: "Rangi — administracja" },
  { key: "MLODSZY_ADMINISTRATOR", label: "• Młodszy Administrator •", group: "Rangi — administracja" },

  // ---------- rangi: moderacja ----------
  { key: "STARSZY_MODERATOR", label: "• Starszy Moderator •", group: "Rangi — moderacja" },
  { key: "MODERATOR", label: "• Moderator •", group: "Rangi — moderacja" },
  { key: "MLODSZY_MODERATOR", label: "• Młodszy Moderator •", group: "Rangi — moderacja" },

  // ---------- rangi: support ----------
  { key: "SUPPORT", label: "• Support •", group: "Rangi — support" },
  { key: "TRIAL_SUPPORT", label: "• Trial Support •", group: "Rangi — support" },

  // ---------- uprawnienia granularne ----------
  { key: "KICK_MEMBERS", label: "Wyrzucanie członków (kick)", group: "Uprawnienia granularne" },
  { key: "BAN_MEMBERS", label: "Banowanie członków", group: "Uprawnienia granularne" },
  { key: "TIMEOUT_MEMBERS", label: "Wyciszanie (timeout)", group: "Uprawnienia granularne" },
  { key: "CLEAR_MESSAGES", label: "Usuwanie wiadomości (clear)", group: "Uprawnienia granularne" },
  { key: "MANAGE_CHANNELS", label: "Zarządzanie kanałami", group: "Uprawnienia granularne" },
  { key: "MANAGE_ROLES", label: "Zarządzanie rolami", group: "Uprawnienia granularne" },
  { key: "VIEW_AUDIT_LOG", label: "Podgląd dziennika audytu", group: "Uprawnienia granularne" },
  { key: "MANAGE_THREADS", label: "Zarządzanie wątkami", group: "Uprawnienia granularne" },
  { key: "MOVE_MEMBERS", label: "Przenoszenie między kanałami głosowymi", group: "Uprawnienia granularne" },
  { key: "MANAGE_NICKNAMES", label: "Zmiana pseudonimów", group: "Uprawnienia granularne" },

  // ---------- uczelnia ----------
  { key: "MANAGE_DEANERY", label: "Dziekanat / Władze Uczelni", group: "Uczelnia" },
  { key: "MANAGE_FACULTY", label: "Zarządzanie wydziałem", group: "Uczelnia" },
  { key: "MANAGE_GRADES", label: "Wystawianie ocen (USOS)", group: "Uczelnia" },
  { key: "MANAGE_EXAMS", label: "Prowadzenie egzaminów", group: "Uczelnia" },
  { key: "MANAGE_SYLLABUS", label: "Edycja sylabusów", group: "Uczelnia" },
  { key: "ACADEMIC_TITLE_PREFIX", label: "Tytuł naukowy (prefix nicku)", group: "Uczelnia" },
  { key: "RECTORATE_ACCESS", label: "Rektorat — audyt całej uczelni (/usos audyt)", group: "Uczelnia" },

  // ---------- rekrutacja i weryfikacja ----------
  { key: "REVIEW_APPLICATIONS", label: "Rozpatrywanie podań", group: "Rekrutacja i weryfikacja" },
  { key: "STUDENT_ROLE", label: "Rola nadawana po akceptacji podania: Student", group: "Rekrutacja i weryfikacja" },
  { key: "WYKLADOWCA_ROLE", label: "Rola nadawana po akceptacji podania: Wykładowca", group: "Rekrutacja i weryfikacja" },
  { key: "ADMINISTRACJA_ROLE", label: "Rola nadawana po akceptacji podania: Administracja", group: "Rekrutacja i weryfikacja" },
  { key: "VERIFIED_ROLE", label: "Rola nadawana po zakończeniu weryfikacji", group: "Rekrutacja i weryfikacja" },
  { key: "STUDY_YEAR_ROLE", label: "Rola roku studiów (uzupełnij też pole Rok studiów)", group: "Rekrutacja i weryfikacja" },

  // ---------- pozostałe ----------
  { key: "MANAGE_EVENTS", label: "Dział Wydarzeń", group: "Pozostałe" },
  { key: "DONATE_UNLIMITED_AI", label: "Nielimitowane AI (rola donate)", group: "Pozostałe" },
  { key: "MANAGE_REACTION_ROLES", label: "Zarządzanie panelami autoról", group: "Pozostałe" },
  { key: "PARTNERSHIP_MANAGER", label: "Odpowiedzialny za partnerstwa", group: "Pozostałe" },

  // ---------- legacy ----------
  { key: "MODERATE", label: "Moderacja (ban/kick/mute/clear) — klucz legacy", group: "Starsze klucze (legacy)", hint: "Zastąpiony przez rangi moderacji; nadal honorowany dla starych powiązań" },
];

/** Klucze pogrupowane w kolejności z PERMISSION_GROUPS_ORDER (do optgroup w UI). */
export function groupPermissionKeys(): { group: string; entries: PermissionKeyEntry[] }[] {
  const byGroup = new Map<string, PermissionKeyEntry[]>();
  for (const entry of PERMISSION_KEYS) {
    if (!byGroup.has(entry.group)) byGroup.set(entry.group, []);
    byGroup.get(entry.group)!.push(entry);
  }
  const ordered = PERMISSION_GROUPS_ORDER.filter((g) => byGroup.has(g));
  // grupy, których nie ma w PERMISSION_GROUPS_ORDER — na końcu, żeby nic nie zniknęło
  for (const g of byGroup.keys()) if (!ordered.includes(g)) ordered.push(g);
  return ordered.map((group) => ({ group, entries: byGroup.get(group)! }));
}
