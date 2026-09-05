import { fetchGuildChannels } from "@/lib/discord";
import { sendPlainMessage, sendEmbedMessage } from "./actions";

export default async function SendMessagePage() {
  const { text } = await fetchGuildChannels();

  return (
    <div>
      <p className="label-eyebrow mb-2">Administracja</p>
      <h1 className="font-display text-3xl mb-2">Wyślij wiadomość</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Wysyła wiadomość jako bot na dowolny kanał tekstowy - zwykły tekst albo embed. Zastępuje dawną komendę{" "}
        <code>/wiadomosc</code>.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <form action={sendPlainMessage} className="card p-5 flex flex-col gap-3">
          <h2 className="font-display text-lg">💬 Zwykła wiadomość</h2>
          <select name="channelId" required>
            <option value="">Wybierz kanał...</option>
            {text.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </select>
          <textarea name="content" placeholder="Treść wiadomości..." rows={4} required />
          <button type="submit" className="btn-primary text-xs self-start">
            Wyślij
          </button>
        </form>

        <form action={sendEmbedMessage} className="card p-5 flex flex-col gap-3">
          <h2 className="font-display text-lg">🖼️ Embed</h2>
          <select name="channelId" required>
            <option value="">Wybierz kanał...</option>
            {text.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </select>
          <input type="text" name="title" placeholder="Tytuł" required />
          <textarea name="description" placeholder="Treść / opis" rows={3} required />
          <input type="text" name="color" placeholder="Kolor HEX (np. 1a2a6c) - opcjonalnie" />
          <input type="text" name="image" placeholder="URL obrazka - opcjonalnie" />
          <input type="text" name="footer" placeholder="Stopka - opcjonalnie" />
          <button type="submit" className="btn-primary text-xs self-start">
            Wyślij embed
          </button>
        </form>
      </div>
    </div>
  );
}
