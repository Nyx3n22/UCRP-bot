import { prisma } from "@/lib/prisma";
import { fetchGuildChannels } from "@/lib/discord";
import PublishVerificationButton from "./PublishButton";

export default async function VerificationPage() {
  const [channelBinding, roleBinding, channels] = await Promise.all([
    prisma.channelBinding.findUnique({ where: { key: "VERIFICATION" } }),
    prisma.roleBinding.findFirst({ where: { permissionKey: "VERIFIED_ROLE" } }),
    fetchGuildChannels(),
  ]);

  const channelName = channels.text.find((c) => c.id === channelBinding?.channelId)?.name;

  return (
    <div>
      <p className="label-eyebrow mb-2">Weryfikacja IC</p>
      <h1 className="font-display text-3xl mb-2">Panel weryfikacji</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Wysyła na skonfigurowany kanał embed z przyciskiem "Rozpocznij weryfikację". Kliknięcie otwiera Modal na
        Discordzie (Imię/Nazwisko IC, data urodzenia), potem captchę, potem weryfikację konta Roblox — cała ta
        logika żyje w bocie, ta strona tylko publikuje wiadomość z przyciskiem.
      </p>

      <div className="card p-6 max-w-xl mb-6">
        <h2 className="font-display text-lg mb-4">Status konfiguracji</h2>
        <ul className="text-sm flex flex-col gap-2">
          <li>
            Kanał weryfikacji:{" "}
            {channelBinding ? (
              <span className="text-brass">#{channelName ?? channelBinding.channelId}</span>
            ) : (
              <span className="text-burgundy">nieskonfigurowany — ustaw w zakładce Kanały (klucz VERIFICATION)</span>
            )}
          </li>
          <li>
            Rola nadawana po weryfikacji:{" "}
            {roleBinding ? (
              <span className="text-brass">{roleBinding.label}</span>
            ) : (
              <span className="text-burgundy">
                nieskonfigurowana — dodaj w zakładce Role, klucz uprawnienia VERIFIED_ROLE
              </span>
            )}
          </li>
        </ul>
      </div>

      {channelBinding ? (
        <PublishVerificationButton />
      ) : (
        <p className="text-sm text-parchment/40">Skonfiguruj najpierw kanał, żeby móc opublikować panel.</p>
      )}
    </div>
  );
}
