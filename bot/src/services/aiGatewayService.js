/**
 * services/aiGatewayService.js
 *
 * Bramka AI oparta WYŁĄCZNIE na Hugging Face — brak jakiejkolwiek
 * ścieżki do Anthropic/OpenAI. Token, model czatu i model automodu
 * pochodzą z AiConfig (Dashboard), nie z .env.
 *
 * Używamy dwóch różnych endpointów HF, bo to dwa różne zadania:
 *  1) Chat completions (bramka AI) -> HF Router, kompatybilny z formatem OpenAI
 *     POST https://router.huggingface.co/v1/chat/completions
 *  2) Klasyfikacja tekstu (automod) -> klasyczny HF Inference API
 *     POST https://api-inference.huggingface.co/models/{model}
 *     (dedykowany model klasyfikacyjny jest tańszy i szybszy niż pytanie
 *     modelu czatowego o JSON, i nie da się "zjailbreakować" promptem)
 */

const { decrypt } = require("../utils/crypto");

const HF_ROUTER_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_INFERENCE_URL = (model) => `https://api-inference.huggingface.co/models/${model}`;

async function callHfChat(apiKey, model, messages) {
  const res = await fetch(HF_ROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Hugging Face API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callHfClassification(apiKey, model, text) {
  const res = await fetch(HF_INFERENCE_URL(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ inputs: text }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Hugging Face Inference API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  // Format zwrotki text-classification: [[{label, score}, ...]] lub [{label, score}, ...]
  // w zależności od modelu — normalizujemy do płaskiej listy.
  return Array.isArray(data[0]) ? data[0] : data;
}

/** Bramka AI — odpowiedź na wiadomość użytkownika na dozwolonym kanale (albo w imieniu NPC, jeśli podano systemPrompt) */
async function generateAiReply(userMessage, aiConfig, { isPremium = false, systemPrompt = null } = {}) {
  const apiKey = decrypt(aiConfig.apiKeyEncrypted);
  const model = isPremium && aiConfig.premiumChatModel ? aiConfig.premiumChatModel : aiConfig.chatModel;

  return callHfChat(apiKey, model, [
    {
      role: "system",
      content:
        systemPrompt ??
        "Jesteś pomocnym asystentem RP na serwerze Uniwersytet Centralny RP. Odpowiadaj zwięźle i w klimacie uczelnianym.",
    },
    { role: "user", content: userMessage },
  ]);
}

/**
 * Automod — klasyfikacja toksyczności przez dedykowany model HF
 * (np. unitary/toxic-bert). Zwraca { violation, reason, score }.
 */
async function runAutomodCheck(content) {
  const prisma = require("../lib/prisma");
  const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
  if (!aiConfig || !aiConfig.automodEnabled) return { violation: false };

  const apiKey = decrypt(aiConfig.apiKeyEncrypted);

  const labels = await callHfClassification(apiKey, aiConfig.automodModel, content);

  const toxic = labels
    .filter((l) => l.label.toLowerCase() !== "neutral" && l.label.toLowerCase() !== "clean")
    .sort((a, b) => b.score - a.score)[0];

  if (toxic && toxic.score >= aiConfig.automodThreshold) {
    return { violation: true, reason: toxic.label, score: toxic.score };
  }

  return { violation: false };
}

module.exports = { generateAiReply, runAutomodCheck };
