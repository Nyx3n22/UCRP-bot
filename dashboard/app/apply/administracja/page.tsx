import ApplicationForm from "../ApplicationForm";

export default function AdministracjaApplicationPage() {
  return (
    <div>
      <h2 className="font-display text-xl mb-6">Podanie — Administracja</h2>
      <ApplicationForm
        type="ADMINISTRACJA"
        fields={[
          {
            name: "stanowisko",
            label: "O jakie stanowisko się ubiegasz?",
            type: "select",
            required: true,
            options: [
              { value: "Moderator", label: "Moderator" },
              { value: "Support", label: "Support" },
              { value: "Dział Wydarzeń", label: "Dział Wydarzeń" },
              { value: "Dział Frakcji", label: "Dział Frakcji" },
              { value: "Inne", label: "Inne" },
            ],
          },
          { name: "doswiadczenie", label: "Doświadczenie w administracji serwerów", type: "textarea", required: true },
          { name: "dyspozycyjnosc", label: "Dyspozycyjność (godz./tydzień)", type: "text", required: true },
          { name: "motywacja", label: "Motywacja", type: "textarea", required: true },
          { name: "sytuacja_przykladowa", label: "Jak rozwiązałbyś konflikt między dwoma graczami?", type: "textarea" },
        ]}
      />
    </div>
  );
}
