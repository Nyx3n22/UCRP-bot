"use server";

import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { revalidatePath } from "next/cache";

function numOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function updateAiConfig(formData: FormData) {
  const chatModel = String(formData.get("chatModel") ?? "");
  const premiumChatModelRaw = String(formData.get("premiumChatModel") ?? "").trim();
  const premiumChatModel = premiumChatModelRaw || null;
  const automodModel = String(formData.get("automodModel") ?? "");
  // Guard przed NaN (puste/złe pole) + clamp do sensownego zakresu progu.
  const automodThreshold = Math.min(1, Math.max(0, numOr(formData.get("automodThreshold"), 0.7)));
  const automodEnabled = formData.get("automodEnabled") === "on";
  const allowedChannelIds = formData.getAll("allowedChannelIds").map(String);
  const newToken = String(formData.get("newToken") ?? "").trim();

  await prisma.aiConfig.upsert({
    where: { id: "singleton" },
    update: {
      chatModel,
      premiumChatModel,
      automodModel,
      automodThreshold,
      automodEnabled,
      allowedChannelIds,
      ...(newToken ? { apiKeyEncrypted: encrypt(newToken) } : {}),
    },
    create: {
      id: "singleton",
      chatModel,
      premiumChatModel,
      automodModel,
      automodThreshold,
      automodEnabled,
      allowedChannelIds,
      apiKeyEncrypted: encrypt(newToken || "PLACEHOLDER_UZUPELNIJ_TOKEN"),
    },
  });

  revalidatePath("/ai-module");
}

export async function upsertPricingTier(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const minChars = Math.max(0, Math.floor(numOr(formData.get("minChars"), 0)));
  const maxCharsRaw = String(formData.get("maxChars") ?? "");
  const maxChars = maxCharsRaw === "" ? null : Math.max(0, Math.floor(numOr(maxCharsRaw, 0)));
  const creditCost = Math.max(0, Math.floor(numOr(formData.get("creditCost"), 0)));

  if (id) {
    await prisma.aiPricingTier.update({ where: { id }, data: { minChars, maxChars, creditCost } });
  } else {
    await prisma.aiPricingTier.create({ data: { minChars, maxChars, creditCost } });
  }
  revalidatePath("/ai-module");
}

export async function deletePricingTier(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.aiPricingTier.delete({ where: { id } }).catch(() => null);
  revalidatePath("/ai-module");
}
