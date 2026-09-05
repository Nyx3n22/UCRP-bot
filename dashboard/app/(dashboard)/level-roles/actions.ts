"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createLevelRoleReward(formData: FormData) {
  const level = Number(formData.get("level"));
  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId || Number.isNaN(level) || level < 1) return;
  await prisma.levelRoleReward.upsert({
    where: { level },
    create: { level, roleId },
    update: { roleId },
  }).catch(() => null);
  revalidatePath("/level-roles");
}

export async function deleteLevelRoleReward(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.levelRoleReward.delete({ where: { id } }).catch(() => null);
  revalidatePath("/level-roles");
}
