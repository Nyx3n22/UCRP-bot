import { prisma } from "./prisma";
import { decrypt } from "./crypto";

/**
 * Zwraca analizę AI dla podania albo null, jeśli moduł AI nie jest skonfigurowany
 * (np. brak tokena) - w takim wypadku podanie i tak trafia do rozpatrzenia,
 * po prostu bez sekcji "Analiza AI" w embedzie.
 */
export async function generateApplicationAnalysis(rawText: string): Promise<string | null> {
  const config = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
  if (!config) return null;

  try {
    const apiKey = decrypt(config.apiKeyEncrypted);
    const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.chatModel,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              "Jesteś asystentem administracji serwera RP oceniającym podania rekrutacyjne. Napisz zwięzłą (4-6 zdań) wstępną analizę: czy odpowiedzi są spójne i przemyślane, jakie są mocne strony zgłoszenia, i na co administracja powinna zwrócić uwagę. To tylko wstępna sugestia - ostateczną decyzję i tak podejmuje człowiek.",
          },
          { role: "user", content: rawText },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
