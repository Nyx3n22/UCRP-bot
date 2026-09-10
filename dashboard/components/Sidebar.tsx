import Link from "next/link";
import SidebarNav, { NavSection } from "./SidebarNav";
import SignOutButton from "./SignOutButton";
import AppLogo from "./AppLogo";
import UserAvatar from "./UserAvatar";

export const NAV_SECTIONS: NavSection[] = [
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

function BrandMark() {
  return (
    <Link href="/" className="group mb-8 flex items-center gap-3 px-2">
      <AppLogo size={42} priority />
      <span className="leading-tight">
        <span className="block font-display text-[1.05rem] tracking-wide transition-colors group-hover:text-brasslight">
          Uniwersytet Centralny
        </span>
        <span className="block text-[0.6rem] uppercase tracking-[0.24em] text-parchment/40">
          Panel administracyjny
        </span>
      </span>
    </Link>
  );
}

export function SidebarBody({ userTag, userImage }: { userTag: string; userImage?: string | null }) {
  return (
    <>
      <div>
        <BrandMark />
        <SidebarNav sections={NAV_SECTIONS} />
      </div>

      <div className="mt-auto pt-6">
        <div className="card glass flex items-center gap-3 p-3">
          <span className="relative shrink-0">
            <UserAvatar src={userImage} name={userTag} size={36} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-emerald-400" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm text-parchment/85" title={userTag}>
              {userTag}
            </span>
            <span className="block text-[0.65rem] uppercase tracking-[0.14em] text-emerald-300/70">
              ● online
            </span>
          </span>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}

export default function Sidebar({ userTag, userImage }: { userTag: string; userImage?: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-line/70 bg-gradient-to-b from-[#141828]/90 to-[#0f121d]/90 px-5 py-7 backdrop-blur-md lg:flex">
      <SidebarBody userTag={userTag} userImage={userImage} />
    </aside>
  );
}
