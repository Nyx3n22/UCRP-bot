"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertChannelBinding(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const channelId = String(formData.get("channelId") ?? "").trim();
  if (!key || !channelId) return;

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
