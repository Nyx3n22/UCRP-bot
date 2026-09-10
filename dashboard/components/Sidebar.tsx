import Link from "next/link";
import SidebarNav, { NavSection } from "./SidebarNav";
import SignOutButton from "./SignOutButton";

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Ogólne",
    items: [{ href: "/", label: "Przegląd" }],
  },
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
      { href: "/research-topics", label: "Tematy badań (Koła)" },
      { href: "/level-roles", label: "Nagrody za poziom" },
      { href: "/moderation", label: "Moderacja" },
      { href: "/send-message", label: "Wyślij wiadomość" },
      { href: "/stypendia", label: "Stypendia" },
      { href: "/exams", label: "Egzaminy" },
      { href: "/syllabuses", label: "Sylabusy" },
      { href: "/library", label: "Biblioteka" },
      { href: "/npcs", label: "Postacie NPC" },
    ],
  },
  {
    label: "Dane",
    items: [
      { href: "/applications", label: "Podania" },
      { href: "/applications-review", label: "Przegląd podań" },
      { href: "/verifications", label: "Weryfikacje" },
      { href: "/characters", label: "Baza postaci" },
      { href: "/logs", label: "Logi" },
    ],
  },
];

export default function Sidebar({ userTag }: { userTag: string }) {
  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-line/70 bg-gradient-to-b from-[#141828] to-[#0f121d] px-5 py-7 overflow-y-auto">
      <div>
        <Link href="/" className="group mb-8 flex items-center gap-3 px-2">
          <span className="brand-crest">UC</span>
          <span className="leading-tight">
            <span className="block font-display text-[1.05rem] tracking-wide transition-colors group-hover:text-brasslight">
              Uniwersytet Centralny
            </span>
            <span className="block text-[0.6rem] uppercase tracking-[0.24em] text-parchment/40">
              Panel administracyjny
            </span>
          </span>
        </Link>

        <SidebarNav sections={NAV_SECTIONS} />
      </div>

      <div className="mt-auto border-t border-line/60 px-2 pt-4">
        <p className="text-[0.62rem] uppercase tracking-[0.18em] text-parchment/35">Zalogowano jako</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-sm text-parchment/80" title={userTag}>
            {userTag}
          </span>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
