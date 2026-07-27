"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createNpc(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const personality = String(formData.get("personality") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();
  if (!name || !personality) return;

  await prisma.npcCharacter.create({
    data: { name, personality, avatarUrl: avatarUrl || null },
  });
  revalidatePath("/npcs");
}

export async function toggleNpc(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await prisma.npcCharacter.update({ where: { id }, data: { active: !active } });
  revalidatePath("/npcs");
}

export async function deleteNpc(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.npcCharacter.delete({ where: { id } }).catch(() => null);
  revalidatePath("/npcs");
}
