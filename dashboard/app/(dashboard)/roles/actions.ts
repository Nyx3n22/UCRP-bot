"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createRoleBinding(formData: FormData) {
  const discordRoleId = String(formData.get("discordRoleId") ?? "");
  const permissionKey = String(formData.get("permissionKey") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const facultyId = String(formData.get("facultyId") ?? "") || null;
  if (!discordRoleId || !permissionKey || !label) return;

  await prisma.roleBinding.upsert({
    where: { discordRoleId_permissionKey: { discordRoleId, permissionKey } },
    update: { label, facultyId },
    create: { discordRoleId, permissionKey, label, facultyId },
  });
  revalidatePath("/roles");
}

export async function deleteRoleBinding(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.roleBinding.delete({ where: { id } }).catch(() => null);
  revalidatePath("/roles");
}
