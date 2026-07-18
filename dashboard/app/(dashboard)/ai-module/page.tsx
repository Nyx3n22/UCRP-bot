import { prisma } from "@/lib/prisma";
import { updateAiConfig, upsertPricingTier, deletePricingTier } from "./actions";

export default async function AiModulePage() {
  const [config, tiers] = await Promise.all([
    prisma.aiConfig.findUnique({ where: { id: "singleton" } }),
    prisma.aiPricingTier.findMany({ orderBy: { minChars: "asc" } }),
  ]);

  return (
    <div>
      <p className="label-eyebrow mb-2">Konfiguracja</p>
      <h1 className="font-display text-3xl mb-2">Moduł AI</h1>
      <p className="text-parchment/60 text-sm mb-8 max-w-2xl">
        Bot korzysta wyłącznie z <span className="text-brass">Hugging Face</span> — bramka czatu przez HF Router,
        automod przez dedykowany model klasyfikacyjny. Token nigdy nie jest pokazywany po zapisaniu — wpisz nowy tylko
        jeśli chcesz go zmienić.
      </p>

      <form action={updateAiConfig} className="card p-6 mb-8 flex flex-col gap-4 max-w-2xl">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/50">Token Hugging Face (hf_...) — zostaw puste, by nie zmieniać</label>
          <input name="newToken" type="password" placeholder={config ? "•••••••• (ustawiony)" : "hf_..."} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Model czatu (bramka AI)</label>
            <input name="chatModel" defaultValue={config?.chatModel ?? "meta-llama/Llama-3.1-8B-Instruct"} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Model automodu (klasyfikacja)</label>
            <input name="automodModel" defaultValue={config?.automodModel ?? "unitary/toxic-bert"} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Próg pewności automodu (0–1)</label>
            <input name="automodThreshold" type="number" step="0.05" min="0" max="1" defaultValue={config?.automodThreshold ?? 0.7} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input name="automodEnabled" type="checkbox" defaultChecked={config?.automodEnabled ?? true} className="w-4 h-4" />
            <label className="text-sm">Automod włączony</label>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/50">Dozwolone kanały bramki AI (ID po przecinku)</label>
          <textarea name="allowedChannelIds" rows={2} defaultValue={config?.allowedChannelIds.join(", ") ?? ""} />
        </div>

        <button type="submit" className="btn-primary self-start">Zapisz konfigurację</button>
      </form>

      <h2 className="font-display text-xl mb-4">Progi kredytów AI</h2>
      <table className="uwrp-table max-w-2xl mb-4">
        <thead>
          <tr>
            <th>Od (znaków)</th>
            <th>Do (znaków)</th>
            <th>Koszt (kredyty)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.id}>
              <td>
                <form id={`tier-${t.id}`} action={upsertPricingTier}>
                  <input type="hidden" name="id" value={t.id} />
                </form>
                <input form={`tier-${t.id}`} name="minChars" type="number" defaultValue={t.minChars} className="w-20" />
              </td>
              <td><input form={`tier-${t.id}`} name="maxChars" type="number" defaultValue={t.maxChars ?? ""} className="w-20" placeholder="bez limitu" /></td>
              <td><input form={`tier-${t.id}`} name="creditCost" type="number" step="0.1" defaultValue={t.creditCost} className="w-20" /></td>
              <td className="flex gap-2">
                <button type="submit" form={`tier-${t.id}`} className="btn-secondary text-xs">Zapisz</button>
                <form action={deletePricingTier}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="btn-danger text-xs">Usuń</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={upsertPricingTier} className="card p-4 flex gap-3 items-end max-w-2xl">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/50">Od</label>
          <input name="minChars" type="number" required className="w-24" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/50">Do (puste = bez limitu)</label>
          <input name="maxChars" type="number" className="w-24" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/50">Koszt</label>
          <input name="creditCost" type="number" step="0.1" required className="w-24" />
        </div>
        <button type="submit" className="btn-primary">Dodaj próg</button>
      </form>
    </div>
  );
}
