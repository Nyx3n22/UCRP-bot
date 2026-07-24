"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createFaculty(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await prisma.faculty.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  revalidatePath("/faculties");
}

export async function deleteFaculty(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Usuwamy tylko jeśli nic się do niego nie odwołuje - Prisma i tak rzuci
  // błędem przy referencyjnej integralności, łapiemy to zamiast wywalać stronę
  await prisma.faculty.delete({ where: { id } }).catch(() => null);
  revalidatePath("/faculties");
}
