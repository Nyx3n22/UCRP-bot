import Link from "next/link";

const NAV = [
  { href: "/", label: "Przegląd" },
  { href: "/channels", label: "Kanały" },
  { href: "/roles", label: "Role i uprawnienia" },
  { href: "/verification", label: "Weryfikacja" },
  { href: "/ai-module", label: "Moduł AI" },
  { href: "/exams", label: "Egzaminy" },
  { href: "/syllabuses", label: "Sylabusy" },
  { href: "/reaction-roles", label: "Autorole" },
  { href: "/characters", label: "Baza postaci" },
  { href: "/logs", label: "Logi" },
];

export default function Sidebar({ userTag }: { userTag: string }) {
  return (
    <aside className="w-64 shrink-0 border-r border-line min-h-screen p-6 flex flex-col justify-between">
      <div>
        <p className="label-eyebrow mb-1">UW RP</p>
        <h1 className="font-display text-xl mb-8">Dashboard</h1>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded text-sm text-parchment/80 hover:bg-panel hover:text-brass transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="text-xs text-parchment/40 border-t border-line pt-4">
        Zalogowano jako<br />
        <span className="text-parchment/70">{userTag}</span>
      </div>
    </aside>
  );
}
