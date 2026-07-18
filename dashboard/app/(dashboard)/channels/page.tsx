import { prisma } from "@/lib/prisma";
import { upsertChannelBinding, deleteChannelBinding } from "./actions";

const SUGGESTED_KEYS = [
  "LOG_MOD", "LOG_AI", "LOG_PUNISHMENTS", "APPLICATIONS_STUDENT", "APPLICATIONS_WYKLADOWCA",
  "APPLICATIONS_ADMINISTRACJA", "VERIFICATION", "ANNOUNCEMENTS", "EXAM_RESULTS",
  "TICKET_TRANSCRIPTS", "TICKET_CATEGORY_SUPPORT", "TICKET_CATEGORY_REPORT", "TICKET_CATEGORY_DEANERY",
  "AUTOROLE_JSON", "LECTURE_HALLS_JSON", "VERIFIED_ROLE",
];

export default async function ChannelsPage() {
  const bindings = await prisma.channelBinding.findMany({ orderBy: { key: "asc" } });

  return (
    <div>
      <p className="label-eyebrow mb-2">Konfiguracja</p>
      <h1 className="font-display text-3xl mb-2">Przypisania kanałów</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Klucz to identyfikator używany w kodzie bota (np. <code>ANNOUNCEMENTS</code>), wartość to ID kanału Discord
        (włącz Tryb Dewelopera na Discordzie, kliknij PPM na kanale → Kopiuj ID kanału). Klucze <code>*_JSON</code>
        (np. <code>AUTOROLE_JSON</code>) przyjmują tablicę ID w formacie JSON, np. <code>["111","222"]</code>.
      </p>

      <div className="card p-6 mb-8">
        <h2 className="font-display text-lg mb-4">Dodaj / zaktualizuj</h2>
        <form action={upsertChannelBinding} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Klucz</label>
            <input name="key" list="suggested-keys" required className="w-64" placeholder="np. ANNOUNCEMENTS" />
            <datalist id="suggested-keys">
              {SUGGESTED_KEYS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">ID kanału / JSON</label>
            <input name="channelId" required className="w-72" placeholder="np. 123456789012345678" />
          </div>
          <button type="submit" className="btn-primary">Zapisz</button>
        </form>
      </div>

      <table className="uwrp-table">
        <thead>
          <tr>
            <th>Klucz</th>
            <th>Wartość</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((b) => (
            <tr key={b.key}>
              <td className="font-mono text-brass">{b.key}</td>
              <td className="font-mono text-xs break-all">{b.channelId}</td>
              <td>
                <form action={deleteChannelBinding}>
                  <input type="hidden" name="key" value={b.key} />
                  <button type="submit" className="btn-danger text-xs">Usuń</button>
                </form>
              </td>
            </tr>
          ))}
          {bindings.length === 0 && (
            <tr>
              <td colSpan={3} className="text-parchment/40 text-center py-8">
                Brak skonfigurowanych przypisań.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
