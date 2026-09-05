"use server";

import { prisma } from "@/lib/prisma";
import { sendChannelMessage } from "@/lib/discord";
import { revalidatePath } from "next/cache";

const BUTTON_STYLE_MAP: Record<string, number> = { PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4 };
const MAX_BUTTONS_PER_ROW = 5;
const MAX_ROWS = 5;

export async function publishGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  if (!groupId || !channelId) return { error: "Wybierz kanał." };

  const group = await prisma.reactionRoleGroup.findUnique({
    where: { id: groupId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!group) return { error: "Nie znaleziono grupy." };
  if (group.options.length === 0) return { error: "Grupa nie ma jeszcze skonfigurowanych opcji." };
  if (group.options.length > MAX_BUTTONS_PER_ROW * MAX_ROWS) return { error: "Za dużo opcji (limit Discorda)." };

  const embed = {
    title: group.title,
    description: group.description ?? "Kliknij przycisk, aby nadać lub zdjąć rolę.",
    color: 0x1a2a6c,
  };

  const components = [];
  for (let i = 0; i < group.options.length; i += MAX_BUTTONS_PER_ROW) {
    const chunk = group.options.slice(i, i + MAX_BUTTONS_PER_ROW);
    components.push({
      type: 1, // ActionRow
      components: chunk.map((opt) => ({
        type: 2, // Button
        style: BUTTON_STYLE_MAP[opt.style] ?? 2,
        label: opt.label,
        custom_id: `reactionrole:${opt.discordRoleIds.join(",")}`,
        ...(opt.emoji ? { emoji: { name: opt.emoji } } : {}),
      })),
    });
  }

  const result = await sendChannelMessage(channelId, { embeds: [embed], components });
  revalidatePath("/reaction-roles");
  return result;
}

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
