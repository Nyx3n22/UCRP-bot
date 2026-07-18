"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "base64");

function encrypt(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export async function updateAiConfig(formData: FormData) {
  const chatModel = String(formData.get("chatModel") ?? "");
  const automodModel = String(formData.get("automodModel") ?? "");
  const automodThreshold = Number(formData.get("automodThreshold") ?? 0.7);
  const automodEnabled = formData.get("automodEnabled") === "on";
  const allowedChannelIds = String(formData.get("allowedChannelIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const newToken = String(formData.get("newToken") ?? "").trim();

  const existing = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });

  await prisma.aiConfig.upsert({
    where: { id: "singleton" },
    update: {
      chatModel,
      automodModel,
      automodThreshold,
      automodEnabled,
      allowedChannelIds,
      ...(newToken ? { apiKeyEncrypted: encrypt(newToken) } : {}),
    },
    create: {
      id: "singleton",
      chatModel,
      automodModel,
      automodThreshold,
      automodEnabled,
      allowedChannelIds,
      apiKeyEncrypted: encrypt(newToken || "PLACEHOLDER_UZUPELNIJ_TOKEN"),
    },
  });

  void existing;
  revalidatePath("/ai-module");
}

export async function upsertPricingTier(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const minChars = Number(formData.get("minChars"));
  const maxCharsRaw = String(formData.get("maxChars") ?? "");
  const maxChars = maxCharsRaw === "" ? null : Number(maxCharsRaw);
  const creditCost = Number(formData.get("creditCost"));

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
