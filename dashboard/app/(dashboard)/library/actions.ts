"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createResource(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const totalCopiesRaw = Number(formData.get("totalCopies") ?? 1);
  const totalCopies = Number.isFinite(totalCopiesRaw) ? Math.max(1, Math.floor(totalCopiesRaw)) : 1;
  if (!title) return;

  await prisma.libraryResource.create({ data: { title, totalCopies } });
  revalidatePath("/library");
}

export async function deleteResource(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.libraryLoan.deleteMany({ where: { resourceId: id } });
  await prisma.libraryResource.delete({ where: { id } }).catch(() => null);
  revalidatePath("/library");
}
