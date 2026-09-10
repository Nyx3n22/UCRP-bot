import Link from "next/link";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="card card-accent p-10 text-center">
          <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-burgundy/60 bg-burgundy/20 text-2xl">
            🔒
          </span>
          <p className="label-eyebrow mb-3 !text-[#eb8ea4]">Brak dostępu</p>
          <h1 className="mb-2 font-display text-2xl">Nie masz uprawnień do panelu</h1>
          <p className="mb-6 text-sm text-parchment/55">
            Twoje role na serwerze nie są powiązane z kluczem <code>DASHBOARD_ACCESS</code>.
          </p>

          {hasDebug && (
            <div className="mb-6 flex flex-col gap-1 rounded-lg border border-line bg-ink/70 p-4 text-left font-mono text-xs">
              <p className="mb-1 font-semibold text-brass">Diagnostyka (pokaż to Claude, żeby ustalić przyczynę):</p>
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
              <p>ID ról: {searchParams.roles || "(brak)"}</p>
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
