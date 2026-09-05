import { prisma } from "@/lib/prisma";
import { fetchGuildChannels } from "@/lib/discord";
import { upsertChannelBinding, deleteChannelBinding } from "./actions";

const SINGLE_CHANNEL_KEYS = [
  "LOG_MOD", "LOG_AI", "LOG_PUNISHMENTS", "APPLICATIONS_STUDENT", "APPLICATIONS_WYKLADOWCA",
  "APPLICATIONS_ADMINISTRACJA", "VERIFICATION", "VERIFICATION_REVIEW", "ANNOUNCEMENTS", "EXAM_RESULTS", "TICKET_TRANSCRIPTS",
  "TICKET_CATEGORY_SUPPORT", "TICKET_CATEGORY_REPORT", "TICKET_CATEGORY_DEANERY",
  "KOLA_NAUKOWE", "KOLA_REVIEW", "LEVEL_UP",
  "TICKET_PANEL", "PARTNERSTWO_PANEL", "APPLICATIONS_REVIEW", "STYPENDIUM", "TICKET_CATEGORY_PARTNERSTWO",
];

const MULTI_CHANNEL_KEYS = ["AUTOROLE_JSON"];

export default async function ChannelsPage() {
  const [bindings, channels] = await Promise.all([
    prisma.channelBinding.findMany({ orderBy: { key: "asc" } }),
    fetchGuildChannels(),
  ]);

  const bindingByKey = new Map(bindings.map((b) => [b.key, b.channelId]));
  const textNameById = new Map(channels.text.map((c) => [c.id, c.name]));
  const voiceNameById = new Map(channels.voice.map((c) => [c.id, c.name]));

  return (
    <div>
      <p className="label-eyebrow mb-2">Konfiguracja</p>
      <h1 className="font-display text-3xl mb-2">Przypisania kanałów</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Wybierz kanał z listy — Dashboard pobiera ją na żywo z Discorda, nie trzeba już ręcznie wklejać ID.
      </p>

      {channels.text.length === 0 && (
        <div className="card p-4 mb-6 border-burgundy text-sm">
          ⚠️ Nie udało się pobrać listy kanałów z Discorda. Sprawdź <code>DISCORD_BOT_TOKEN</code> i{" "}
          <code>GUILD_ID</code> w zmiennych środowiskowych Render.
        </div>
      )}

      <h2 className="font-display text-lg mb-4">Kanały tekstowe (pojedyncze)</h2>
      <div className="flex flex-col gap-3 mb-10 max-w-2xl">
        {SINGLE_CHANNEL_KEYS.map((key) => (
          <form key={key} action={upsertChannelBinding} className="card p-4 flex items-center gap-3 justify-between">
            <div>
              <p className="font-mono text-xs text-brass">{key}</p>
              {bindingByKey.get(key) && (
                <p className="text-xs text-parchment/40">obecnie: #{textNameById.get(bindingByKey.get(key)!) ?? bindingByKey.get(key)}</p>
              )}
            </div>
            <input type="hidden" name="key" value={key} />
            <div className="flex items-center gap-2">
              <select name="channelId" defaultValue={bindingByKey.get(key) ?? ""} className="w-56">
                <option value="">— wybierz kanał —</option>
                {channels.text.map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
              <button type="submit" className="btn-primary text-xs">Zapisz</button>
            </div>
          </form>
        ))}
      </div>

      <h2 className="font-display text-lg mb-4">Listy kanałów (wielokrotny wybór)</h2>
      <div className="flex flex-col gap-4 mb-10 max-w-2xl">
        {MULTI_CHANNEL_KEYS.map((key) => {
          const currentIds = (() => {
            try {
              return JSON.parse(bindingByKey.get(key) ?? "[]") as string[];
            } catch {
              return [];
            }
          })();
          const pool = key === "LECTURE_HALLS_JSON" ? channels.voice : channels.text;
          const nameMap = key === "LECTURE_HALLS_JSON" ? voiceNameById : textNameById;

          return (
            <form key={key} action={upsertChannelBinding} className="card p-4">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="isJsonList" value="true" />
              <p className="font-mono text-xs text-brass mb-2">{key}</p>
              {currentIds.length > 0 && (
                <p className="text-xs text-parchment/40 mb-2">
                  obecnie: {currentIds.map((id) => nameMap.get(id) ?? id).join(", ")}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-3 max-h-40 overflow-y-auto">
                {pool.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="channelIds"
                      value={c.id}
                      defaultChecked={currentIds.includes(c.id)}
                      className="w-4 h-4"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <button type="submit" className="btn-primary text-xs">Zapisz listę</button>
            </form>
          );
        })}
      </div>

      <h2 className="font-display text-lg mb-4">Wszystkie zapisane przypisania</h2>
      <table className="uwrp-table max-w-2xl">
        <thead>
          <tr><th>Klucz</th><th>Wartość</th><th></th></tr>
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
        </tbody>
      </table>
    </div>
  );
}
