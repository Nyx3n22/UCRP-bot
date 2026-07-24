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
  const discordRoleIds = formData.getAll("discordRoleIds").map(String);
  const label = String(formData.get("label") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const style = String(formData.get("style") ?? "SECONDARY");
  const order = Number(formData.get("order") ?? 0);
  if (!groupId || discordRoleIds.length === 0 || !label) return;

  await prisma.reactionRoleOption.create({
    data: { groupId, discordRoleIds, label, emoji: emoji || null, style: style as never, order },
  });
  revalidatePath("/reaction-roles");
}

export async function updateOption(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const discordRoleIds = formData.getAll("discordRoleIds").map(String);
  const label = String(formData.get("label") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const style = String(formData.get("style") ?? "SECONDARY");
  const order = Number(formData.get("order") ?? 0);
  if (!id || discordRoleIds.length === 0 || !label) return;

  await prisma.reactionRoleOption.update({
    where: { id },
    data: { discordRoleIds, label, emoji: emoji || null, style: style as never, order },
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
