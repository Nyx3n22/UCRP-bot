"use server";

import { prisma } from "@/lib/prisma";
import { banGuildMember, kickGuildMember, timeoutGuildMember } from "@/lib/discord";
import { revalidatePath } from "next/cache";

async function requireDiscordId(formData: FormData) {
  const raw = String(formData.get("userId") ?? "").trim();
  const match = raw.match(/\d{15,25}/);
  return match?.[0] ?? null;
}

export async function banUser(formData: FormData) {
  const userId = await requireDiscordId(formData);
  const reason = String(formData.get("reason") ?? "Brak powodu");
  if (!userId) return { error: "Nieprawidłowe ID/wzmianka użytkownika." };

  const result = await banGuildMember(userId, reason);
  if (result.ok) {
    await prisma.actionLog.create({ data: { actorId: "DASHBOARD", action: "BAN", targetId: userId, metadata: { reason } } });
  }
  revalidatePath("/moderation");
  return result;
}

export async function kickUser(formData: FormData) {
  const userId = await requireDiscordId(formData);
  const reason = String(formData.get("reason") ?? "Brak powodu");
  if (!userId) return { error: "Nieprawidłowe ID/wzmianka użytkownika." };

  const result = await kickGuildMember(userId, reason);
  if (result.ok) {
    await prisma.actionLog.create({ data: { actorId: "DASHBOARD", action: "KICK", targetId: userId, metadata: { reason } } });
  }
  revalidatePath("/moderation");
  return result;
}

export async function timeoutUser(formData: FormData) {
  const userId = await requireDiscordId(formData);
  const minutes = Number(formData.get("minutes"));
  const reason = String(formData.get("reason") ?? "Brak powodu");
  if (!userId || Number.isNaN(minutes) || minutes < 1) return { error: "Nieprawidłowe dane." };

  const result = await timeoutGuildMember(userId, minutes, reason);
  if (result.ok) {
    await prisma.actionLog.create({ data: { actorId: "DASHBOARD", action: "MUTE", targetId: userId, metadata: { reason, minutes } } });
  }
  revalidatePath("/moderation");
  return result;
}

export async function issuePunishment(formData: FormData) {
  const userId = await requireDiscordId(formData);
  const severity = String(formData.get("severity") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!userId || !["UPOMNIENIE", "NAGANA", "ZAWIESZENIE", "WYDALENIE"].includes(severity) || !reason) {
    return { error: "Nieprawidłowe dane." };
  }

  await prisma.discordUser.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  await prisma.punishment.create({
    data: { userId, issuedById: "DASHBOARD", reason, severity: severity as any },
  });
  revalidatePath("/moderation");
  return { ok: true };
}
