import { prisma } from "@/lib/prisma";
import ApplicationForm from "../ApplicationForm";

export default async function StudentApplicationPage() {
  const faculties = await prisma.faculty.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h2 className="font-display text-xl mb-6">Podanie — Student</h2>
      <ApplicationForm
        type="STUDENT"
        fields={[
          {
            name: "wydzial",
            label: "Wydział",
            type: "select",
            required: true,
            options: faculties.map((f) => ({ value: f.name, label: f.name })),
          },
          {
            name: "rok",
            label: "Pożądany rok studiów",
            type: "select",
            required: true,
            options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Rok ${n}` })),
          },
          { name: "motywacja", label: "Dlaczego chcesz studiować u nas?", type: "textarea", required: true },
          { name: "doswiadczenie_rp", label: "Doświadczenie w roleplay (opcjonalnie)", type: "textarea" },
          { name: "skad", label: "Skąd dowiedziałeś się o serwerze?", type: "text" },
          { name: "dodatkowe", label: "Dodatkowe informacje (opcjonalnie)", type: "textarea" },
        ]}
      />
    </div>
  );
}
