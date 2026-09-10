"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = {
  label: string;
  items: { href: string; label: string }[];
};

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  "/": "M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5",
  "/channels": "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
  "/roles": "M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z",
  "/verification": "m9 11.5 2 2 4-4M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z",
  "/ai-module": "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  "/reaction-roles": "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  "/faculties": "M22 9 12 4 2 9l10 5 10-5ZM6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v5",
  "/research-topics": "M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3M7.5 14h9",
  "/level-roles": "M8 21h8M12 17v4M17 4H7v5a5 5 0 0 0 10 0V4ZM17 5h3v1a3 3 0 0 1-3 3M7 5H4v1a3 3 0 0 0 3 3",
  "/moderation": "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  "/send-message": "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13",
  "/stypendia": "M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.2 5 1.4 5 3.3-2.2 3-5 3-5-1.1-5-3",
  "/exams": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6m-9 4h6m-6 4h4",
  "/syllabuses": "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  "/library": "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5m-8-9h4m-4 4h4",
  "/npcs": "M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13-4v6m-3-3h6",
  "/applications": "M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-5-6ZM15 3v6h5M9 13h6M9 17h6",
  "/applications-review": "m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  "/verifications": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13-8-2 2-1-1",
  "/characters": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M13 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  "/logs": "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
};

export function NavIcon({ href }: { href: string }) {
  return (
    <span className="nav-icon">
      <Icon d={ICONS[href] ?? "M4 12h16"} />
    </span>
  );
}

export default function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section, si) => (
        <div key={section.label} className="animate-enter" style={{ animationDelay: `${0.05 + si * 0.06}s` }}>
          <p className="mb-2 px-3 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brass/60">
            {section.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link ${active ? "nav-link-active" : ""}`}
                >
                  <NavIcon href={item.href} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
