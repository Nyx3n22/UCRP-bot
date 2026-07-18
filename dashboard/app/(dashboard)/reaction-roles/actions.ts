"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createGroup(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!key || !title) return;

  await prisma.reactionRoleGroup.create({ data: { key, title, description: description || null } });
  revalidatePath("/reaction-roles");
}

export async function addOption(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "");
  const discordRoleId = String(formData.get("discordRoleId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const style = String(formData.get("style") ?? "SECONDARY");
  const order = Number(formData.get("order") ?? 0);
  if (!groupId || !discordRoleId || !label) return;

  await prisma.reactionRoleOption.create({
    data: { groupId, discordRoleId, label, emoji: emoji || null, style: style as never, order },
  });
  revalidatePath("/reaction-roles");
}

export async function deleteOption(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.reactionRoleOption.delete({ where: { id } }).catch(() => null);
  revalidatePath("/reaction-roles");
}

export async function deleteGroup(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.reactionRoleOption.deleteMany({ where: { groupId: id } });
  await prisma.reactionRoleGroup.delete({ where: { id } }).catch(() => null);
  revalidatePath("/reaction-roles");
}
