"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function saveSyllabus(formData: FormData) {
  const subjectId = String(formData.get("subjectId") ?? "");
  const content = String(formData.get("content") ?? "");
  if (!subjectId) return;

  await prisma.syllabus.upsert({
    where: { subjectId },
    update: { content },
    create: { subjectId, content },
  });

  revalidatePath("/syllabuses");
}
