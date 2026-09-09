import { prisma } from "@/lib/prisma";
import { fetchGuildChannels, fetchGuildRoles } from "@/lib/discord";
import { upsertChannelBinding, deleteChannelBinding } from "./actions";

const SINGLE_TEXT_KEYS = [
  "LOG_MOD", "LOG_AI", "LOG_PUNISHMENTS", "APPLICATIONS_STUDENT", "APPLICATIONS_WYKLADOWCA",
  "APPLICATIONS_ADMINISTRACJA", "VERIFICATION", "VERIFICATION_REVIEW", "ANNOUNCEMENTS", "EXAM_RESULTS", "TICKET_TRANSCRIPTS",
  "KOLA_NAUKOWE", "KOLA_REVIEW", "LEVEL_UP",
  "TICKET_PANEL", "PARTNERSTWO_PANEL", "APPLICATIONS_REVIEW", "STYPENDIUM",
];

// Kategorie Discorda (typ 4), nie kanały tekstowe - osobna pula, bo bot
// tworzy w nich tickety i przekazanie ID kanału tekstowego by failowało.
const SINGLE_CATEGORY_KEYS = [
  "TICKET_CATEGORY_SUPPORT", "TICKET_CATEGORY_REPORT", "TICKET_CATEGORY_DEANERY", "TICKET_CATEGORY_PARTNERSTWO",
];

// LECTURE_HALLS_JSON = lista ID kanałów GŁOSOWYCH (attendanceService),
// AUTOROLE_JSON = lista ID RÓL (guildMemberAdd) - nie kanałów!
const MULTI_VOICE_KEYS = ["LECTURE_HALLS_JSON"];
const MULTI_ROLE_KEYS = ["AUTOROLE_JSON"];

export default async function ChannelsPage() {
  const [bindings, channels, roles] = await Promise.all([
    prisma.channelBinding.findMany({ orderBy: { key: "asc" } }),
    fetchGuildChannels(),
    fetchGuildRoles(),
  ]);

  const bindingByKey = new Map(bindings.map((b: any) => [b.key, b.channelId]));
  const textNameById = new Map(channels.text.map((c: any) => [c.id, c.name]));
  const voiceNameById = new Map(channels.voice.map((c: any) => [c.id, c.name]));
  const categoryNameById = new Map(channels.categories.map((c: any) => [c.id, c.name]));
  const roleNameById = new Map(roles.map((r: any) => [r.id, r.name]));

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
        {SINGLE_TEXT_KEYS.map((key) => (
          <form key={key} action={upsertChannelBinding} className="card p-4 flex items-center gap-3 justify-between">
            <div>
              <p className="font-mono text-xs text-brass">{key}</p>
              {!!bindingByKey.get(key) && (
                <p className="text-xs text-parchment/40">obecnie: #{textNameById.get(bindingByKey.get(key)!) ?? bindingByKey.get(key)}</p>
              )}
            </div>
            <input type="hidden" name="key" value={key} />
            <div className="flex items-center gap-2">
              <select name="channelId" defaultValue={(bindingByKey.get(key) as string) ?? ""} className="w-56">
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

      <h2 className="font-display text-lg mb-4">Kategorie (do ticketów)</h2>
      <div className="flex flex-col gap-3 mb-10 max-w-2xl">
        {SINGLE_CATEGORY_KEYS.map((key) => (
          <form key={key} action={upsertChannelBinding} className="card p-4 flex items-center gap-3 justify-between">
            <div>
              <p className="font-mono text-xs text-brass">{key}</p>
              {!!bindingByKey.get(key) && (
                <p className="text-xs text-parchment/40">obecnie: {categoryNameById.get(bindingByKey.get(key)!) ?? bindingByKey.get(key)}</p>
              )}
            </div>
            <input type="hidden" name="key" value={key} />
            <div className="flex items-center gap-2">
              <select name="channelId" defaultValue={(bindingByKey.get(key) as string) ?? ""} className="w-56">
                <option value="">— wybierz kategorię —</option>
                {channels.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className="btn-primary text-xs">Zapisz</button>
            </div>
          </form>
        ))}
      </div>

      <h2 className="font-display text-lg mb-4">Sale wykładowe (kanały głosowe, wielokrotny wybór)</h2>
      <div className="flex flex-col gap-4 mb-10 max-w-2xl">
        {MULTI_VOICE_KEYS.map((key) => {
          const currentIds = (() => {
            try {
              return JSON.parse((bindingByKey.get(key) as string) ?? "[]") as string[];
            } catch {
              return [];
            }
          })();

          return (
            <form key={key} action={upsertChannelBinding} className="card p-4">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="isJsonList" value="true" />
              <p className="font-mono text-xs text-brass mb-2">{key}</p>
              {currentIds.length > 0 && (
                <p className="text-xs text-parchment/40 mb-2">
                  obecnie: {currentIds.map((id) => voiceNameById.get(id) ?? id).join(", ")}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-3 max-h-40 overflow-y-auto">
                {channels.voice.map((c) => (
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

      <h2 className="font-display text-lg mb-4">Autorole (role, wielokrotny wybór)</h2>
      <div className="flex flex-col gap-4 mb-10 max-w-2xl">
        {MULTI_ROLE_KEYS.map((key) => {
          const currentIds = (() => {
            try {
              return JSON.parse((bindingByKey.get(key) as string) ?? "[]") as string[];
            } catch {
              return [];
            }
          })();

          return (
            <form key={key} action={upsertChannelBinding} className="card p-4">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="isJsonList" value="true" />
              <p className="font-mono text-xs text-brass mb-2">{key}</p>
              <p className="text-xs text-parchment/40 mb-2">Role nadawane automatycznie nowym członkom serwera.</p>
              {currentIds.length > 0 && (
                <p className="text-xs text-parchment/40 mb-2">
                  obecnie: {currentIds.map((id) => roleNameById.get(id) ?? id).join(", ")}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-3 max-h-40 overflow-y-auto">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="channelIds"
                      value={r.id}
                      defaultChecked={currentIds.includes(r.id)}
                      className="w-4 h-4"
                    />
                    {r.name}
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
          {bindings.map((b: any) => (
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
