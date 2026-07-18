"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createSubject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const facultyId = String(formData.get("facultyId") ?? "");
  const ectsPoints = Number(formData.get("ectsPoints") ?? 0);
  if (!name || !facultyId) return;

  await prisma.subject.create({ data: { name, facultyId, ectsPoints } });
  revalidatePath("/exams");
}

export async function addExamQuestion(formData: FormData) {
  const subjectId = String(formData.get("subjectId") ?? "");
  const topic = String(formData.get("topic") ?? "");
  const content = String(formData.get("content") ?? "");
  const order = Number(formData.get("order") ?? 0);
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
