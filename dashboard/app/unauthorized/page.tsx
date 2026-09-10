import Link from "next/link";
import AppLogo from "@/components/AppLogo";

type SearchParams = {
  discordId?: string;
  status?: string;
  guildId?: string;
  hasToken?: string;
  roleCount?: string;
  roles?: string;
};

export default function UnauthorizedPage({ searchParams }: { searchParams: SearchParams }) {
  const hasDebug = Boolean(searchParams.discordId);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="animate-enter mb-6 flex items-center justify-center gap-3">
          <AppLogo size={42} />
          <span className="leading-tight">
            <span className="block font-display text-lg tracking-wide">Uniwersytet Centralny RP</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.24em] text-parchment/40">
              Panel administracyjny
            </span>
          </span>
        </div>
        <div className="card card-accent glass animate-enter enter-d2 p-10 text-center">
          <span className="mx-auto mb-5 grid h-14 w-14 animate-float place-items-center rounded-full border border-burgundy/60 bg-burgundy/20 text-2xl shadow-[0_0_30px_-8px_rgba(138,37,71,0.7)]">
            🔒
          </span>
          <p className="label-eyebrow mb-3 !text-[#eb8ea4]">Brak dostępu</p>
          <h1 className="mb-2 font-display text-2xl">Nie masz uprawnień do panelu</h1>
          <p className="mb-6 text-sm text-parchment/55">
            Twoje role na serwerze nie są powiązane z kluczem <code>DASHBOARD_ACCESS</code>.
          </p>

          {hasDebug && (
            <div className="mb-6 flex flex-col gap-1 rounded-lg border border-line bg-ink/70 p-4 text-left font-mono text-xs">
              <p className="mb-1 font-semibold text-brass">Diagnostyka (pokaż to administracji, żeby ustalić przyczynę):</p>
              <p>Twoje Discord ID: {searchParams.discordId}</p>
              <p>GUILD_ID w Dashboardzie: {searchParams.guildId}</p>
              <p>DISCORD_BOT_TOKEN ustawiony: {searchParams.hasToken}</p>
              <p>
                Status odpowiedzi Discord API:{" "}
                <span className={searchParams.status === "200" ? "badge badge-green" : "badge badge-red"}>
                  {searchParams.status}
                </span>{" "}
                {searchParams.status === "401" && "(token bota nieprawidłowy/wygasły)"}
                {searchParams.status === "403" && "(bot nie ma dostępu / nie jest na tym serwerze)"}
                {searchParams.status === "404" && "(nie znaleziono takiego użytkownika na tym serwerze - zły GUILD_ID albo nie jesteś członkiem)"}
                {searchParams.status === "network_error" && "(błąd sieciowy - nie udało się połączyć z Discord API)"}
              </p>
              <p>Liczba ról znalezionych: {searchParams.roleCount}</p>
              <p className="break-all">ID ról: {searchParams.roles || "(brak)"}</p>
            </div>
          )}

          <Link href="/login" className="btn-secondary">
            ← Wróć do logowania
          </Link>
        </div>
      </div>
    </div>
  );
}
