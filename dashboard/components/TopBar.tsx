"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SidebarNav from "./SidebarNav";
import { NAV_SECTIONS } from "./Sidebar";
import SignOutButton from "./SignOutButton";

/**
 * Mobilny pasek górny + wysuwana szuflada nawigacji.
 * Na desktopie (lg+) ukryty — tam króluje Sidebar.
 */
export default function TopBar({ userTag }: { userTag: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open ]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line/70 bg-ink/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Otwórz menu"
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-panel/60 text-parchment/80 transition-colors hover:border-brass/50 hover:text-brasslight"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/" className="flex items-center gap-2.5">
          <span className="brand-crest !h-9 !w-9 !text-xs">UC</span>
          <span className="leading-tight">
            <span className="block font-display text-sm tracking-wide">Uniwersytet Centralny</span>
            <span className="block text-[0.58rem] uppercase tracking-[0.22em] text-parchment/40">
              Panel administracyjny
            </span>
          </span>
        </Link>
        <span className="ml-auto hidden max-w-[10rem] truncate text-xs text-parchment/50 sm:block" title={userTag}>
          {userTag}
        </span>
      </header>

      {/* Nakładka + szuflada */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-50 transition-opacity lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <aside
          className={`absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto border-r border-line/70 bg-gradient-to-b from-[#141828] to-[#0f121d] px-5 py-6 transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-6 flex items-center justify-between px-2">
            <span className="flex items-center gap-2.5">
              <span className="brand-crest !h-9 !w-9 !text-xs">UC</span>
              <span className="font-display text-sm">Menu</span>
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Zamknij menu"
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-parchment/60 transition-colors hover:border-brass/50 hover:text-brasslight"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <SidebarNav sections={NAV_SECTIONS} onNavigate={() => setOpen(false)} />
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/60 px-2 pt-4">
            <span className="truncate text-xs text-parchment/60" title={userTag}>
              {userTag}
            </span>
            <SignOutButton />
          </div>
        </aside>
      </div>
    </>
  );
}
