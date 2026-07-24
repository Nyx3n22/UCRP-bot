/**
 * lib/permissionKeys.ts
 * UWAGA: ta lista musi być ręcznie zsynchronizowana z PERMISSION_KEYS
 * w bot/src/config/roles.js — to dwa osobne projekty TS/JS, więc nie da się
 * po prostu zaimportować jednego pliku w drugim bez wspólnego pakietu.
 * Jeśli dodajesz nowy klucz uprawnienia w kodzie bota, dopisz go i tutaj.
 */

export const PERMISSION_KEYS = [
  { key: "DASHBOARD_ACCESS", label: "Dostęp do Dashboardu (pełny)" },
  { key: "MANAGE_PROJECT", label: "Zarząd Projektu" },
  { key: "MANAGE_TECH", label: "Administracja Techniczna" },
  { key: "MODERATE", label: "Moderacja (ban/kick/mute/clear)" },
  { key: "MANAGE_EVENTS", label: "Dział Wydarzeń" },
  { key: "DONATE_UNLIMITED_AI", label: "Nielimitowane AI (rola donate)" },
  { key: "MANAGE_DEANERY", label: "Dziekanat / Władze Uczelni" },
  { key: "MANAGE_FACULTY", label: "Zarządzanie wydziałem" },
  { key: "MANAGE_GRADES", label: "Wystawianie ocen (USOS)" },
  { key: "MANAGE_EXAMS", label: "Prowadzenie egzaminów" },
  { key: "MANAGE_SYLLABUS", label: "Edycja sylabusów" },
  { key: "ACADEMIC_TITLE_PREFIX", label: "Tytuł naukowy (prefix nicku)" },
  { key: "REVIEW_APPLICATIONS", label: "Rozpatrywanie podań" },
  { key: "MANAGE_REACTION_ROLES", label: "Zarządzanie panelami autoról" },
  { key: "STUDENT_ROLE", label: "Rola nadawana po akceptacji podania: Student" },
  { key: "WYKLADOWCA_ROLE", label: "Rola nadawana po akceptacji podania: Wykładowca" },
  { key: "ADMINISTRACJA_ROLE", label: "Rola nadawana po akceptacji podania: Administracja" },
  { key: "VERIFIED_ROLE", label: "Rola nadawana po zakończeniu weryfikacji" },
  { key: "RECTORATE_ACCESS", label: "Rektorat - audyt całej uczelni (/usos audyt)" },
  { key: "PARTNERSHIP_MANAGER", label: "Odpowiedzialny za partnerstwa" },
] as const;
