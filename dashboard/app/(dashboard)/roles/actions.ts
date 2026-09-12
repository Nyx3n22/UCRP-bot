"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { fetchGuildRoles } from "@/lib/discord";
import { isDividerRoleName } from "@/lib/permissionHierarchy";

export async function createRoleBinding(formData: FormData) {
  const discordRoleId = String(formData.get("discordRoleId") ?? "");
  const permissionKey = String(formData.get("permissionKey") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const facultyId = String(formData.get("facultyId") ?? "") || null;
  const studyYearRaw = String(formData.get("studyYear") ?? "").trim();
  const studyYear = studyYearRaw ? Number(studyYearRaw) : null;
  if (!discordRoleId || !permissionKey || !label) return;

  // Przegródki („•══════• Kategoria •══════•") są wyłącznie wizualne — nigdy
  // nie dostają powiązania. Formularz je pomija, ale akcja jest drugą linią
  // obrony (np. ktoś wyśle POST z zewnątrz albo zmieni nazwę roli na Discordzie).
  const guildRoles = await fetchGuildRoles();
  const role = guildRoles.find((r) => r.id === discordRoleId);
  if (role && isDividerRoleName(role.name)) return;

  await prisma.roleBinding.upsert({
    where: { discordRoleId_permissionKey: { discordRoleId, permissionKey } },
    update: { label, facultyId, studyYear },
    create: { discordRoleId, permissionKey, label, facultyId, studyYear },
  });
  revalidatePath("/roles");
}

export async function deleteRoleBinding(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.roleBinding.delete({ where: { id } }).catch(() => null);
  revalidatePath("/roles");
}
