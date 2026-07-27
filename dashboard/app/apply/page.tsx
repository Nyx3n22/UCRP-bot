import Link from "next/link";

const OPTIONS = [
  { href: "/apply/student", title: "Student", desc: "Podanie o przyjęcie na studia" },
  { href: "/apply/wykladowca", title: "Wykładowca", desc: "Podanie o stanowisko wykładowcy" },
  { href: "/apply/administracja", title: "Administracja", desc: "Podanie o stanowisko w administracji serwera" },
];

export default function ApplyLandingPage() {
  return (
    <div>
      <p className="text-parchment/60 text-sm mb-8">Wybierz rodzaj podania, które chcesz złożyć.</p>
      <div className="flex flex-col gap-4">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="card p-6 block hover:border-brass transition-colors">
            <h2 className="font-display text-xl mb-1">{o.title}</h2>
            <p className="text-sm text-parchment/60">{o.desc}</p>
          </Link>
        ))}
      </div>
      <Link href="/apply/status" className="text-sm text-brass underline mt-8 inline-block">
        Sprawdź status moich podań →
      </Link>
    </div>
  );
}
