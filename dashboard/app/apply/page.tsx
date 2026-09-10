import Link from "next/link";

const OPTIONS = [
  { href: "/apply/student", title: "Student", desc: "Podanie o przyjęcie na studia", emoji: "🎓" },
  { href: "/apply/wykladowca", title: "Wykładowca", desc: "Podanie o stanowisko wykładowcy", emoji: "👨‍🏫" },
  { href: "/apply/administracja", title: "Administracja", desc: "Podanie o stanowisko w administracji serwera", emoji: "⚙️" },
];

export default function ApplyLandingPage() {
  return (
    <div>
      <p className="mb-8 text-sm text-parchment/55">Wybierz rodzaj podania, które chcesz złożyć.</p>
      <div className="flex flex-col gap-4">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="card card-hover group flex items-center gap-4 p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-brass/25 bg-brass/10 text-xl">
              {o.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl">{o.title}</span>
              <span className="block text-sm text-parchment/50">{o.desc}</span>
            </span>
            <span aria-hidden className="text-brass/50 transition-all group-hover:translate-x-0.5 group-hover:text-brass">
              →
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-8">
        <Link href="/apply/status" className="btn-secondary text-sm">
          Sprawdź status moich podań
        </Link>
      </div>
    </div>
  );
}
