import { prisma } from "@/lib/prisma";
import { createNpc, toggleNpc, deleteNpc } from "./actions";

export default async function NpcsPage() {
  const npcs = await prisma.npcCharacter.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <p className="label-eyebrow mb-2">Roleplay</p>
      <h1 className="font-display text-3xl mb-2">Postacie NPC (AI)</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        AI gra tymi postaciami na komendę <code>/npc rozmawiaj</code> — wiadomość publikowana jest przez webhook z
        nazwą i awatarem NPC, nie jako bot. Opis osobowości staje się instrukcją dla AI, jak dana postać ma się
        zachowywać i mówić — im bardziej konkretny, tym lepsza jakość odpowiedzi.
      </p>

      <div className="card p-6 mb-8 max-w-xl">
        <h2 className="font-display text-lg mb-4">Nowa postać</h2>
        <form action={createNpc} className="flex flex-col gap-3">
          <input name="name" placeholder="Imię NPC (np. Woźny Kazimierz)" required />
          <textarea
            name="personality"
            rows={4}
            placeholder="Osobowość/tło, np. 'Zgryźliwy, ale sercem złoty woźny pracujący na uczelni 30 lat. Mówi archaicznym językiem, narzeka na młodzież, ale zawsze pomoże w potrzebie.'"
            required
          />
          <input name="avatarUrl" placeholder="URL awatara (opcjonalnie)" />
          <button type="submit" className="btn-primary self-start">Dodaj NPC</button>
        </form>
      </div>

      <table className="uwrp-table max-w-3xl">
        <thead>
          <tr>
            <th>Imię</th>
            <th>Osobowość</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {npcs.map((npc) => (
            <tr key={npc.id}>
              <td>{npc.name}</td>
              <td className="text-xs text-parchment/60 max-w-sm truncate">{npc.personality}</td>
              <td>
                <form action={toggleNpc}>
                  <input type="hidden" name="id" value={npc.id} />
                  <input type="hidden" name="active" value={String(npc.active)} />
                  <button type="submit" className={npc.active ? "btn-secondary text-xs" : "btn-primary text-xs"}>
                    {npc.active ? "Aktywny" : "Wyłączony"}
                  </button>
                </form>
              </td>
              <td>
                <form action={deleteNpc}>
                  <input type="hidden" name="id" value={npc.id} />
                  <button type="submit" className="btn-danger text-xs">Usuń</button>
                </form>
              </td>
            </tr>
          ))}
          {npcs.length === 0 && (
            <tr><td colSpan={4} className="text-center text-parchment/40 py-8">Brak postaci NPC.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
