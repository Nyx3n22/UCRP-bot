/**
 * config/roles.js
 *
 * Zamiast hardkodować ID ról, kod operuje na "kluczach uprawnień".
 * Faktyczne powiązanie klucz -> ID roli na Discordzie jest w tabeli
 * RoleBinding, edytowalnej z Dashboardu.
 *
 * Cache w pamięci odświeżany co 60s, żeby nie odpytywać bazy przy
 * każdej interakcji.
 */

const prisma = require("../lib/prisma");

const PERMISSION_KEYS = {
  MANAGE_PROJECT: "MANAGE_PROJECT",
  MANAGE_TECH: "MANAGE_TECH",
  DASHBOARD_ACCESS: "DASHBOARD_ACCESS", // pełny dostęp do panelu Web Dashboard
  MODERATE: "MODERATE",
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
};

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

/**
 * @param member GuildMember (discord.js)
 * @param permissionKey klucz z PERMISSION_KEYS
 */
async function hasPermission(member, permissionKey) {
  const bindings = await loadBindings();
  const relevantRoleIds = bindings
    .filter((b) => b.permissionKey === permissionKey)
    .map((b) => b.discordRoleId);

  if (relevantRoleIds.length === 0) return false;
  return member.roles.cache.some((r) => relevantRoleIds.includes(r.id));
}

/** Zwraca wiążącą rolę tytułu naukowego (do prefixu nicku), jeśli member ją ma */
async function getScientificTitleBinding(member) {
  const bindings = await loadBindings();
  const titleBindings = bindings.filter((b) => b.permissionKey === PERMISSION_KEYS.ACADEMIC_TITLE_PREFIX);
  return titleBindings.find((b) => member.roles.cache.has(b.discordRoleId)) ?? null;
}

/** Zwraca ID pierwszej roli Discord powiązanej z danym kluczem uprawnień (np. do nadania po akceptacji podania) */
async function getRoleIdForPermission(permissionKey) {
  const bindings = await loadBindings();
  const binding = bindings.find((b) => b.permissionKey === permissionKey);
  return binding?.discordRoleId ?? null;
}

module.exports = { PERMISSION_KEYS, hasPermission, getScientificTitleBinding, getRoleIdForPermission };
