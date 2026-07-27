import { prisma } from "@/lib/prisma";
import ApplicationForm from "../ApplicationForm";

export default async function WykladowcaApplicationPage() {
  const faculties = await prisma.faculty.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h2 className="font-display text-xl mb-6">Podanie — Wykładowca</h2>
      <ApplicationForm
        type="WYKLADOWCA"
        fields={[
          {
            name: "wydzial",
            label: "Wydział",
            type: "select",
            required: true,
            options: faculties.map((f) => ({ value: f.name, label: f.name })),
          },
          { name: "przedmioty", label: "Przedmiot(y), który chcesz prowadzić", type: "text", required: true },
          { name: "doswiadczenie", label: "Doświadczenie (IC/OOC)", type: "textarea", required: true },
          { name: "motywacja", label: "Motywacja", type: "textarea", required: true },
          { name: "dyspozycyjnosc", label: "Dyspozycyjność (godz./tydzień)", type: "text", required: true },
          { name: "portfolio", label: "Link do portfolio/CV (opcjonalnie)", type: "text" },
        ]}
      />
    </div>
  );
}
