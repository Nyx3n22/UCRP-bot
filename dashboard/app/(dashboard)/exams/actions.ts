"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createSubject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const facultyId = String(formData.get("facultyId") ?? "");
  const ectsRaw = Number(formData.get("ectsPoints") ?? 0);
  const ectsPoints = Number.isFinite(ectsRaw) ? Math.max(0, Math.floor(ectsRaw)) : 0;
  if (!name || !facultyId) return;

  // Upsert po @@unique([name, facultyId]) - ponowny zapis tego samego
  // przedmiotu crashował formularz błędem P2002.
  await prisma.subject.upsert({
    where: { name_facultyId: { name, facultyId } },
    update: { ectsPoints },
    create: { name, facultyId, ectsPoints },
  });
  revalidatePath("/exams");
}

export async function addExamQuestion(formData: FormData) {
  const subjectId = String(formData.get("subjectId") ?? "");
  const topic = String(formData.get("topic") ?? "");
  const content = String(formData.get("content") ?? "");
  const orderRaw = Number(formData.get("order") ?? 0);
  const order = Number.isFinite(orderRaw) ? Math.floor(orderRaw) : 0;
  if (!subjectId || !content) return;

  await prisma.examQuestion.create({ data: { subjectId, topic, content, order } });
  revalidatePath("/exams");
}

export async function deleteExamQuestion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.examQuestion.delete({ where: { id } }).catch(() => null);
  revalidatePath("/exams");
}
