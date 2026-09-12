/**
 * lib/permissions.ts
 * Dostęp do Dashboardu wymaga roli powiązanej w Dashboardzie samym z sobą
 * (klucz DASHBOARD_ACCESS) — to jedyne uprawnienie, które NIE może być
 * skonfigurowane wyłącznie z poziomu Dashboardu z oczywistych powodów
 * (trzeba je ustawić raz, ręcznie w bazie lub przez seed, żeby ktokolwiek
 * mógł się zalogować i nadawać dalsze uprawnienia).
 *
 * Dziedziczenie hierarchii: użytkownik powiązany z rangą (np. STARSZY_MODERATOR)
 * ma też wszystko, co mają rangi niższe (MODERATOR, MLODSZY_MODERATOR) oraz
 * uprawnienia granularne przyznane „z urzędu" (RANK_GRANTS) — to samo
 * domknięcie co w bot/src/config/roles.js (lib/permissionHierarchy.ts).
 */

import { prisma } from "./prisma";
import { fetchGuildMemberRoleIds } from "./discord";
import { expandPermissionKeys } from "./permissionHierarchy";

export async function getUserPermissionKeys(discordUserId: string): Promise<Set<string>> {
  const roleIds = await fetchGuildMemberRoleIds(discordUserId);
  if (roleIds.length === 0) return new Set();

  const bindings = await prisma.roleBinding.findMany({
    where: { discordRoleId: { in: roleIds } },
  });

  return new Set(bindings.map((b: any) => b.permissionKey));
}

/**
 * Efektywne uprawnienia użytkownika: klucze z RoleBinding + wszystko, co
 * wynika z hierarchii rang i kompatybilności ze starymi kluczami.
 */
export async function getEffectivePermissionKeys(discordUserId: string): Promise<Set<string>> {
  return expandPermissionKeys(await getUserPermissionKeys(discordUserId));
}

export async function hasDashboardAccess(discordUserId: string): Promise<boolean> {
  const keys = await getUserPermissionKeys(discordUserId);
  return keys.has("DASHBOARD_ACCESS");
}

export async function hasPermission(discordUserId: string, key: string): Promise<boolean> {
  const keys = await getEffectivePermissionKeys(discordUserId);
  return keys.has(key) || keys.has("DASHBOARD_ACCESS"); // DASHBOARD_ACCESS = pełny dostęp (Zarząd/Development)
}

/** Prawda, gdy użytkownik ma co najmniej jeden z podanych kluczy. */
export async function hasAnyPermission(discordUserId: string, keys: string[]): Promise<boolean> {
  const effective = await getEffectivePermissionKeys(discordUserId);
  if (effective.has("DASHBOARD_ACCESS")) return true;
  return keys.some((key) => effective.has(key));
}
