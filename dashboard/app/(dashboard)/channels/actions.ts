"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertChannelBinding(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const isJsonList = formData.get("isJsonList") === "true";

  if (!key) return;

  if (isJsonList) {
    const channelIds = formData.getAll("channelIds").map(String);
    await prisma.channelBinding.upsert({
      where: { key },
      update: { channelId: JSON.stringify(channelIds) },
      create: { key, channelId: JSON.stringify(channelIds) },
    });
    revalidatePath("/channels");
    return;
  }

  const channelId = String(formData.get("channelId") ?? "").trim();
  if (!channelId) return;

  await prisma.channelBinding.upsert({
    where: { key },
    update: { channelId },
    create: { key, channelId },
  });

  revalidatePath("/channels");
}

export async function deleteChannelBinding(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  if (!key) return;
  await prisma.channelBinding.delete({ where: { key } }).catch(() => null);
  revalidatePath("/channels");
}
