import { prisma } from "@/lib/prisma";
import { createResearchTopic, toggleResearchTopic, deleteResearchTopic, setServerInviteLink } from "./actions";

export default async function ResearchTopicsPage() {
  const [topics, generalConfig] = await Promise.all([
    prisma.researchTopic.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.generalConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  return (
    <div>
      <p className="label-eyebrow mb-2">Koła Naukowe</p>
      <h1 className="font-display text-3xl mb-2">Tematy badań</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Koła mogą od razu rozpocząć badanie na temat z tej listy (bez akceptacji). Zgłoszenie własnego, spoza listy
        tematu zawsze trafia do oceny AI i administracji. Wyłączenie tematu (zamiast usunięcia) zachowuje historię
        wcześniej prowadzonych badań na ten temat.
      </p>

      <form action={setServerInviteLink} className="card p-4 flex items-center gap-3 mb-8 max-w-xl">
        <input
          type="text"
          name="serverInviteLink"
          placeholder="Link zaproszenia na DRUGI serwer Kół Naukowych (np. discord.gg/xxxxx)"
          defaultValue={generalConfig?.serverInviteLink ?? ""}
          className="flex-1"
        />
        <button type="submit" className="btn-primary text-xs">
          Zapisz link
        </button>
      </form>
      <p className="text-parchment/40 text-xs mb-8 max-w-2xl -mt-6">
        Wysyłany zaproszonym członkom koła w wiadomości z prośbą o potwierdzenie dostępu - Koła Naukowe (kategorie,
        kanały, role) żyją na osobnym serwerze Discord niż reszta bota, więc każdy członek musi tam dołączyć.
      </p>

      <form action={createResearchTopic} className="card p-4 flex items-center gap-3 mb-8 max-w-xl">
        <input type="text" name="title" placeholder="Nowy temat badania..." required className="flex-1" />
        <button type="submit" className="btn-primary text-xs">
          Dodaj
        </button>
      </form>

      <table className="uwrp-table max-w-2xl">
        <thead>
          <tr>
            <th>Temat</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id}>
              <td>{t.title}</td>
              <td>
                <form action={toggleResearchTopic}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={String(t.active)} />
                  <button type="submit" className={t.active ? "btn-primary text-xs" : "btn-secondary text-xs"}>
                    {t.active ? "Aktywny" : "Wyłączony"}
                  </button>
                </form>
              </td>
              <td>
                <form action={deleteResearchTopic}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="btn-danger text-xs">
                    Usuń
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {topics.length === 0 && (
            <tr>
              <td colSpan={3} className="text-parchment/40 text-sm py-4">
                Brak tematów. Dodaj pierwszy powyżej.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
