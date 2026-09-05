"use server";

import { prisma } from "@/lib/prisma";
import { sendChannelMessage } from "@/lib/discord";
import { revalidatePath } from "next/cache";

const DEFAULT_MIN_GPA = 4.5;
const DEFAULT_AMOUNT_IC = 1500;

async function calculateGpa(userId: string): Promise<number | null> {
  const grades = await prisma.grade.findMany({ where: { userId } });
  if (grades.length === 0) return null;
  return grades.reduce((sum, g) => sum + g.value, 0) / grades.length;
}

export async function runPayout(formData: FormData) {
  const facultyId = String(formData.get("facultyId") ?? "");
  const minGpa = Number(formData.get("minGpa")) || DEFAULT_MIN_GPA;
  const amountIC = Number(formData.get("amountIC")) || DEFAULT_AMOUNT_IC;
  if (!facultyId) return;

  const faculty = await prisma.faculty.findUnique({ where: { id: facultyId } });
  if (!faculty) return;

  const students = await prisma.character.findMany({ where: { facultyId } });
  const results: { userId: string; gpa: number }[] = [];

  for (const student of students) {
    const gpa = await calculateGpa(student.userId);
    if (gpa === null || gpa < minGpa) continue;

    await prisma.scholarship.create({ data: { userId: student.userId, amountIC, gpaAtIssue: gpa } });
    await prisma.character.update({ where: { userId: student.userId }, data: { salaryIC: { increment: amountIC } } });
    results.push({ userId: student.userId, gpa });
  }

  const binding = await prisma.channelBinding.findUnique({ where: { key: "STYPENDIUM" } });
  if (binding) {
    const embed = {
      title: "🎓 Wypłacono stypendia",
      description:
        results.length === 0
          ? `Brak studentów wydziału **${faculty.name}** spełniających próg GPA ${minGpa.toFixed(2)}.`
          : results.map((r) => `<@${r.userId}> — GPA ${r.gpa.toFixed(2)} — ${amountIC} IC`).join("\n"),
      color: 0x8a1538,
      footer: { text: `Wydział: ${faculty.name}` },
    };
    await sendChannelMessage(binding.channelId, { embeds: [embed] });
  }

  revalidatePath("/stypendia");
}
