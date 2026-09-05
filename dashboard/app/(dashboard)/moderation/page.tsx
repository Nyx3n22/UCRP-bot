import { prisma } from "@/lib/prisma";
import { banUser, kickUser, timeoutUser, issuePunishment } from "./actions";

export default async function ModerationPage() {
  const recentActions = await prisma.actionLog.findMany({
    where: { actorId: "DASHBOARD" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const recentPunishments = await prisma.punishment.findMany({
    where: { issuedById: "DASHBOARD" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div>
      <p className="label-eyebrow mb-2">Administracja</p>
      <h1 className="font-display text-3xl mb-2">Moderacja</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Wszystkie akcje moderacyjne wykonywane są tu zamiast komendami na Discordzie. Podaj ID Discorda lub wklej
        wzmiankę (np. <code>&lt;@123456789012345678&gt;</code>) - obie formy działają.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <form action={async (formData) => { await banUser(formData); }} className="card p-5 flex flex-col gap-3">
          <h2 className="font-display text-lg">🔨 Ban</h2>
          <input type="text" name="userId" placeholder="ID / wzmianka użytkownika" required />
          <input type="text" name="reason" placeholder="Powód" required />
          <button type="submit" className="btn-danger text-xs self-start">
            Zbanuj
          </button>
        </form>

        <form action={kickUser} className="card p-5 flex flex-col gap-3">
          <h2 className="font-display text-lg">👢 Kick</h2>
          <input type="text" name="userId" placeholder="ID / wzmianka użytkownika" required />
          <input type="text" name="reason" placeholder="Powód" required />
          <button type="submit" className="btn-danger text-xs self-start">
            Wyrzuć
          </button>
        </form>

        <form action={timeoutUser} className="card p-5 flex flex-col gap-3">
          <h2 className="font-display text-lg">🔇 Wycisz (timeout)</h2>
          <input type="text" name="userId" placeholder="ID / wzmianka użytkownika" required />
          <input type="number" name="minutes" placeholder="Minuty" min={1} required />
          <input type="text" name="reason" placeholder="Powód" required />
          <button type="submit" className="btn-primary text-xs self-start">
            Wycisz
          </button>
        </form>

        <form action={issuePunishment} className="card p-5 flex flex-col gap-3">
          <h2 className="font-display text-lg">⚖️ Kara dyscyplinarna IC</h2>
          <input type="text" name="userId" placeholder="ID / wzmianka użytkownika" required />
          <select name="severity" required>
            <option value="">Rodzaj kary...</option>
            <option value="UPOMNIENIE">Upomnienie</option>
            <option value="NAGANA">Nagana</option>
            <option value="ZAWIESZENIE">Zawieszenie</option>
            <option value="WYDALENIE">Wydalenie</option>
          </select>
          <input type="text" name="reason" placeholder="Powód" required />
          <button type="submit" className="btn-primary text-xs self-start">
            Wydaj karę
          </button>
        </form>
      </div>

      <h2 className="font-display text-xl mt-10 mb-3">Ostatnie akcje (Discord)</h2>
      <div className="flex flex-col gap-2">
        {recentActions.map((a) => (
          <div key={a.id} className="card p-3 text-sm flex justify-between">
            <span>
              <span className="text-brass font-mono text-xs mr-2">{a.action}</span>
              <span className="font-mono text-xs text-parchment/40">{a.targetId}</span>
            </span>
            <span className="text-parchment/40 text-xs">{a.createdAt.toLocaleString("pl-PL")}</span>
          </div>
        ))}
        {recentActions.length === 0 && <p className="text-parchment/40 text-sm">Brak akcji.</p>}
      </div>

      <h2 className="font-display text-xl mt-10 mb-3">Ostatnie kary IC</h2>
      <div className="flex flex-col gap-2">
        {recentPunishments.map((p) => (
          <div key={p.id} className="card p-3 text-sm flex justify-between">
            <span>
              <span className="text-brass font-mono text-xs mr-2">{p.severity}</span>
              <span className="font-mono text-xs text-parchment/40">{p.userId}</span> — {p.reason}
            </span>
            <span className="text-parchment/40 text-xs">{p.createdAt.toLocaleString("pl-PL")}</span>
          </div>
        ))}
        {recentPunishments.length === 0 && <p className="text-parchment/40 text-sm">Brak kar.</p>}
      </div>
    </div>
  );
}
