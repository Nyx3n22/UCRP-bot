"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createResearchTopic(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await prisma.researchTopic.create({ data: { title } }).catch(() => null);
  revalidatePath("/research-topics");
}

export async function toggleResearchTopic(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;
  await prisma.researchTopic.update({ where: { id }, data: { active: !active } }).catch(() => null);
  revalidatePath("/research-topics");
}

export async function deleteResearchTopic(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.researchTopic.delete({ where: { id } }).catch(() => null);
  revalidatePath("/research-topics");
}
