import Link from "next/link";
import { prisma } from "@/lib/prisma";
import CountUp from "@/components/CountUp";
import Clock from "@/components/Clock";
import Reveal from "@/components/Reveal";

async function getStats() {
  const [characters, tickets, applications, punishments, activeExams, recentLogs] = await Promise.all([
    prisma.character.count(),
    prisma.ticket.count({ where: { status: { not: "CLOSED" } } }),
    prisma.application.count({ where: { status: "PENDING" } }),
    prisma.punishment.count(),
    prisma.examSession.count({ where: { status: "ONGOING" } }),
    prisma.actionLog.findMany({ orderBy: { createdAt: "desc" }, take: 7 }),
  ]);
  return { characters, tickets, applications, punishments, activeExams, recentLogs };
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

function StatCard({
  label,
  value,
  icon,
  delay,
  max,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  delay: string;
  max: number;
  hint: string;
}) {
  const pct = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 6;
  return (
    <div className={`card card-hover animate-enter ${delay} group flex flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="label-eyebrow pt-1">{label}</p>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brass/25 bg-brass/10 text-brass transition-all duration-300 group-hover:scale-110 group-hover:border-brass/50 group-hover:shadow-glow-soft">
          {icon}
        </span>
      </div>
      <p className="font-display text-4xl leading-none text-parchment">
        <CountUp value={value} />
      </p>
      <div>
        <div className="stat-bar">
          <span style={{ width: `${pct}%`, animationDelay: "0.35s" }} />
        </div>
        <p className="mt-2 text-[0.7rem] text-parchment/40">{hint}</p>
      </div>
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

const ACTION_LABELS: Record<string, string> = {
  BAN: "Ban użytkownika",
  KICK: "Wyrzucenie użytkownika",
  MUTE: "Wyciszenie użytkownika",
  CLEAR: "Czyszczenie kanału",
  USOS_ZATRUDNIENIE: "Zatrudnienie (USOS)",
  USOS_ZWOLNIENIE: "Zwolnienie (USOS)",
  AUTOMOD_DELETE: "Automod: usunięcie wiadomości",
};

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "przed chwilą";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  if (d === 1) return "wczoraj";
  if (d < 7) return `${d} dni temu`;
  return date.toLocaleDateString("pl-PL");
}

export default async function OverviewPage() {
  const stats = await getStats();
  const max = Math.max(stats.characters, stats.tickets, stats.applications, stats.punishments, stats.activeExams, 1);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="card card-accent gradient-ring animate-enter relative mb-8 overflow-hidden p-8 sm:p-10">
        <div aria-hidden className="hero-glow" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-12 select-none font-display text-[10rem] font-bold leading-none text-brass/[0.06] sm:text-[13rem]"
        >
          UC
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            <div className="mb-3 flex items-center gap-3">
              <p className="label-eyebrow">Uniwersytet Centralny RP · Przegląd</p>
              <span className="badge badge-green">
                <span className="status-dot" />
                System działa
              </span>
            </div>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">
              Stan <span className="gold-text font-semibold italic">serwera</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-parchment/55">
              Zagregowane dane z bazy bota — postaci, tickety, podania i aktywność akademicka.
              Szczegółowe moduły znajdziesz w nawigacji po lewej stronie.
            </p>
          </div>
          <div className="card glass hidden shrink-0 items-center px-5 py-4 md:flex">
            <Clock />
          </div>
        </div>
      </div>

      {/* ── Statystyki ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Postacie w bazie" value={stats.characters} icon={<IconUsers />} delay="enter-d1" max={max} hint="Zarejestrowane postacie IC" />
        <StatCard label="Otwarte tickety" value={stats.tickets} icon={<IconTicket />} delay="enter-d2" max={max} hint="Wymagające obsługi" />
        <StatCard label="Podania do rozpatrzenia" value={stats.applications} icon={<IconDocument />} delay="enter-d3" max={max} hint="Oczekujące decyzje" />
        <StatCard label="Kary dyscyplinarne" value={stats.punishments} icon={<IconScale />} delay="enter-d4" max={max} hint="Łącznie w historii" />
        <StatCard label="Trwające egzaminy" value={stats.activeExams} icon={<IconCap />} delay="enter-d5" max={max} hint="Aktywne sesje" />
      </div>

      {/* ── Szybkie akcje + aktywność ────────────────────── */}
      <div className="mt-12 grid gap-8 xl:grid-cols-5">
        <Reveal className="xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl">Szybkie akcje</h2>
            <span aria-hidden className="h-px flex-1 mx-4 bg-gradient-to-r from-brass/30 to-transparent" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {QUICK_LINKS.map((q) => (
              <Link key={q.href} href={q.href} className="card card-hover group flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brass/25 bg-brass/10 text-brass transition-all duration-300 group-hover:scale-110 group-hover:bg-brass/20 group-hover:shadow-glow-soft">
                  {q.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg leading-snug">{q.title}</span>
                  <span className="block truncate text-sm text-parchment/50">{q.desc}</span>
                </span>
                <span aria-hidden className="quick-arrow ml-auto text-xl text-brass/50">
                  →
                </span>
              </Link>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120} className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl">Ostatnia aktywność</h2>
            <Link href="/logs" className="text-xs font-semibold text-brass/80 transition-colors hover:text-brasslight">
              Wszystkie logi →
            </Link>
          </div>
          <div className="card glass p-2">
            {stats.recentLogs.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-parchment/40">
                Brak zarejestrowanych akcji. Logi pojawią się po pierwszych działaniach administracji.
              </p>
            )}
            <ol className="relative flex flex-col">
              {stats.recentLogs.map((log: any, i: number) => (
                <li
                  key={log.id}
                  className={`group flex items-start gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-brass/[0.05] ${
                    i !== stats.recentLogs.length - 1 ? "border-b border-line/40" : ""
                  }`}
                >
                  <span className="timeline-dot mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brass transition-shadow group-hover:shadow-glow" />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="block truncate text-sm text-parchment/85">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[0.68rem] text-parchment/35">
                      {log.actorId}
                      {log.targetId ? ` → ${log.targetId}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-[0.7rem] text-parchment/40">{timeAgo(log.createdAt)}</span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
