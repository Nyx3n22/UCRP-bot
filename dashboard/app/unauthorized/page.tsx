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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-2xl w-full p-10 text-center">
        <p className="label-eyebrow mb-3 text-burgundy">Brak dostępu</p>
        <h1 className="font-display text-2xl mb-2">Nie masz uprawnień do panelu</h1>
        <p className="text-parchment/60 text-sm mb-6">
          Twoje role na serwerze nie są powiązane z kluczem <code>DASHBOARD_ACCESS</code>.
        </p>

        {hasDebug && (
          <div className="text-left text-xs font-mono bg-ink border border-line rounded p-4 flex flex-col gap-1">
            <p className="text-brass mb-1">Diagnostyka (pokaż to Claude, żeby ustalić przyczynę):</p>
            <p>Twoje Discord ID: {searchParams.discordId}</p>
            <p>GUILD_ID w Dashboardzie: {searchParams.guildId}</p>
            <p>DISCORD_BOT_TOKEN ustawiony: {searchParams.hasToken}</p>
            <p>
              Status odpowiedzi Discord API:{" "}
              <span className={searchParams.status === "200" ? "text-green-400" : "text-burgundy"}>
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
      </div>
    </div>
  );
}
