import { prisma } from "@/lib/prisma";
import { fetchGuildChannels } from "@/lib/discord";
import PublishVerificationButton from "./PublishButton";
import { updateVerificationConfig } from "./actions";

export default async function VerificationPage() {
  const [channelBinding, roleBinding, channels, verificationConfig] = await Promise.all([
    prisma.channelBinding.findUnique({ where: { key: "VERIFICATION" } }),
    prisma.roleBinding.findFirst({ where: { permissionKey: "VERIFIED_ROLE" } }),
    fetchGuildChannels(),
    prisma.verificationConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  const channelName = channels.text.find((c) => c.id === channelBinding?.channelId)?.name;

  return (
    <div>
      <p className="label-eyebrow mb-2">Weryfikacja IC</p>
      <h1 className="font-display text-3xl mb-2">Panel weryfikacji</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Wysyła na skonfigurowany kanał embed z przyciskiem "Rozpocznij weryfikację". Kliknięcie otwiera Modal na
        Discordzie (Imię/Nazwisko IC, data urodzenia, nazwa Roblox), potem captchę, potem weryfikację konta Roblox
        przez kod w opisie profilu — cała ta logika żyje w bocie, ta strona tylko publikuje wiadomość i konfiguruje
        jej treść oraz parametry.
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

      <div className="card p-6 mb-6 max-w-xl">
        <h2 className="font-display text-lg mb-4">Ustawienia</h2>
        <form action={updateVerificationConfig} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-parchment/50">Długość kodu captcha (znaków)</label>
              <input name="captchaCodeLength" type="number" min={4} max={12} defaultValue={verificationConfig?.captchaCodeLength ?? 6} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-parchment/50">Długość kodu Roblox (znaków)</label>
              <input name="robloxCodeLength" type="number" min={4} max={16} defaultValue={verificationConfig?.robloxCodeLength ?? 8} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Tytuł panelu (embed na kanale weryfikacji)</label>
            <input
              name="panelTitle"
              defaultValue={verificationConfig?.panelTitle ?? "🎓 Weryfikacja — Uniwersytet Centralny RP"}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Opis panelu</label>
            <textarea
              name="panelDescription"
              rows={3}
              defaultValue={
                verificationConfig?.panelDescription ??
                "Kliknij przycisk poniżej, aby rozpocząć weryfikację. Podasz Imię i Nazwisko IC oraz datę urodzenia, przejdziesz captchę, a na końcu połączymy Twoje konto z Robloxem."
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Instrukcja wklejenia kodu w profilu Roblox</label>
            <textarea
              name="robloxInstructions"
              rows={3}
              defaultValue={
                verificationConfig?.robloxInstructions ??
                'Wejdź na swój profil Roblox → Edytuj profil → Opis (About), wklej podany kod, zapisz zmiany, wróć tutaj i kliknij "Sprawdź teraz".'
              }
            />
          </div>
          <button type="submit" className="btn-primary self-start">Zapisz ustawienia</button>
        </form>
      </div>

      {channelBinding ? (
        <PublishVerificationButton />
      ) : (
        <p className="text-sm text-parchment/40">Skonfiguruj najpierw kanał, żeby móc opublikować panel.</p>
      )}
    </div>
  );
}
