"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavSection = {
  label: string;
  items: { href: string; label: string }[];
};

export default function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.label}>
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
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-brass/10 font-medium text-brasslight"
                      : "text-parchment/70 hover:bg-white/[0.04] hover:text-parchment"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brass" />
                  )}
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
