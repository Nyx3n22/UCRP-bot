import Link from "next/link";
import { prisma } from "@/lib/prisma";

async function getStats() {
  const [characters, tickets, applications, punishments, activeExams] = await Promise.all([
    prisma.character.count(),
    prisma.ticket.count({ where: { status: { not: "CLOSED" } } }),
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.punishment.count(),
    prisma.examSession.count({ where: { status: "ONGOING" } }),
  ]);
  return { characters, tickets, applications, punishments, activeExams };
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M15.5 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconTicket() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
      <path d="M13 6v2m0 3v2m0 3v2" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  );
}

function IconScale() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18M8 21h8M6 7l-3 6a3 3 0 0 0 6 0L6 7Zm12 0-3 6a3 3 0 0 0 6 0l-3-6ZM4 7h16" />
    </svg>
  );
}

function IconCap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 9 12 4 2 9l10 5 10-5Z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v5" />
    </svg>
  );
}

function IconHash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m9 11.5 2 2 4-4" />
    </svg>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="card card-hover flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="label-eyebrow pt-1">{label}</p>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brass/25 bg-brass/10 text-brass">
          {icon}
        </span>
      </div>
      <p className="font-display text-4xl leading-none text-parchment">{value}</p>
    </div>
  );
}

const QUICK_LINKS = [
  {
    href: "/applications-review",
    title: "Przegląd podań",
    desc: "Zaakceptuj lub odrzuć oczekujące podania kandydatów.",
    icon: <IconDocument />,
  },
  {
    href: "/channels",
    title: "Przypisania kanałów",
    desc: "Podłącz kanały Discorda do modułów bota.",
    icon: <IconHash />,
  },
  {
    href: "/reaction-roles",
    title: "Autorole",
    desc: "Opublikuj panele przycisków z rolami na serwerze.",
    icon: <IconGrid />,
  },
  {
    href: "/verification",
    title: "Panel weryfikacji",
    desc: "Skonfiguruj i opublikuj weryfikację IC.",
    icon: <IconShield />,
  },
];

export default async function OverviewPage() {
  const stats = await getStats();

  return (
    <div>
      <div className="card card-accent relative mb-10 overflow-hidden p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 select-none font-display text-[11rem] font-bold leading-none text-brass/[0.05]"
        >
          UC
        </div>
        <p className="label-eyebrow mb-3">Uniwersytet Centralny RP · Przegląd</p>
        <h1 className="font-display text-4xl">Stan serwera</h1>
        <p className="mt-3 max-w-2xl text-sm text-parchment/55">
          Zagregowane dane z bazy bota — postaci, tickety, podania i aktywność akademicka. Szczegółowe moduły
          znajdziesz w nawigacji po lewej stronie.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Postacie w bazie" value={stats.characters} icon={<IconUsers />} />
        <StatCard label="Otwarte tickety" value={stats.tickets} icon={<IconTicket />} />
        <StatCard label="Podania do rozpatrzenia" value={stats.applications} icon={<IconDocument />} />
        <StatCard label="Kary dyscyplinarne" value={stats.punishments} icon={<IconScale />} />
        <StatCard label="Trwające egzaminy" value={stats.activeExams} icon={<IconCap />} />
      </div>

      <h2 className="mb-4 mt-12 font-display text-xl">Szybkie akcje</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {QUICK_LINKS.map((q) => (
          <Link key={q.href} href={q.href} className="card card-hover group flex items-center gap-4 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-brass/25 bg-brass/10 text-brass transition-colors group-hover:bg-brass/20">
              {q.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg leading-snug">{q.title}</span>
              <span className="block truncate text-sm text-parchment/50">{q.desc}</span>
            </span>
            <span aria-hidden className="ml-auto text-brass/50 transition-all group-hover:translate-x-0.5 group-hover:text-brass">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
