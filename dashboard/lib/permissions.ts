/**
 * lib/permissions.ts
 * Dostęp do Dashboardu wymaga roli powiązanej w Dashboardzie samym z sobą
 * (klucz DASHBOARD_ACCESS) — to jedyne uprawnienie, które NIE może być
 * skonfigurowane wyłącznie z poziomu Dashboardu z oczywistych powodów
 * (trzeba je ustawić raz, ręcznie w bazie lub przez seed, żeby ktokolwiek
 * mógł się zalogować i nadawać dalsze uprawnienia).
 */

import { prisma } from "./prisma";
import { fetchGuildMemberRoleIds } from "./discord";

export async function getUserPermissionKeys(discordUserId: string): Promise<Set<string>> {
  const roleIds = await fetchGuildMemberRoleIds(discordUserId);
  if (roleIds.length === 0) return new Set();

  const bindings = await prisma.roleBinding.findMany({
    where: { discordRoleId: { in: roleIds } },
  });

  return new Set(bindings.map((b) => b.permissionKey));
}

export async function hasDashboardAccess(discordUserId: string): Promise<boolean> {
  const keys = await getUserPermissionKeys(discordUserId);
  return keys.has("DASHBOARD_ACCESS");
}

export async function hasPermission(discordUserId: string, key: string): Promise<boolean> {
  const keys = await getUserPermissionKeys(discordUserId);
  return keys.has(key) || keys.has("DASHBOARD_ACCESS"); // DASHBOARD_ACCESS = pełny dostęp (Zarząd/Development)
}
