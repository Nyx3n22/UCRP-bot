import Link from "next/link";

const NAV_SECTIONS = [
  {
    label: "Konfiguracja",
    items: [
      { href: "/channels", label: "Kanały" },
      { href: "/roles", label: "Role i uprawnienia" },
      { href: "/verification", label: "Weryfikacja" },
      { href: "/ai-module", label: "Moduł AI" },
      { href: "/reaction-roles", label: "Autorole" },
    ],
  },
  {
    label: "Akademia",
    items: [
      { href: "/faculties", label: "Wydziały" },
      { href: "/exams", label: "Egzaminy" },
      { href: "/syllabuses", label: "Sylabusy" },
      { href: "/library", label: "Biblioteka" },
    ],
  },
  {
    label: "Dane",
    items: [
      { href: "/characters", label: "Baza postaci" },
      { href: "/logs", label: "Logi" },
    ],
  },
];

export default function Sidebar({ userTag }: { userTag: string }) {
  return (
    <aside className="w-64 shrink-0 border-r border-line min-h-screen p-6 flex flex-col justify-between overflow-y-auto">
      <div>
        <p className="label-eyebrow mb-1">UW RP</p>
        <Link href="/">
          <h1 className="font-display text-xl mb-8 hover:text-brass transition-colors">Dashboard</h1>
        </Link>

        <nav className="flex flex-col gap-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="text-[0.65rem] uppercase tracking-wider text-parchment/35 mb-1 px-3">{section.label}</p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 rounded text-sm text-parchment/80 hover:bg-panel hover:text-brass transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
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
