"use server";

import { prisma } from "@/lib/prisma";
import { sendChannelMessage } from "@/lib/discord";
import { revalidatePath } from "next/cache";

export async function publishVerificationPanel() {
  const binding = await prisma.channelBinding.findUnique({ where: { key: "VERIFICATION" } });

  if (!binding) {
    return { ok: false, error: "Kanał VERIFICATION nie jest skonfigurowany. Ustaw go najpierw w zakładce Kanały." };
  }

  const result = await sendChannelMessage(binding.channelId, {
    embeds: [
      {
        title: "🎓 Weryfikacja — Uniwersytet Warszawski RP",
        description:
          "Kliknij przycisk poniżej, aby rozpocząć weryfikację. Podasz Imię i Nazwisko IC oraz datę urodzenia, przejdziesz captchę, a na końcu połączymy Twoje konto z Robloxem.",
        color: 0x1a2a6c,
      },
    ],
    components: [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 1, // Primary
            label: "Rozpocznij weryfikację",
            custom_id: "start_verification",
            emoji: { name: "✅" },
          },
        ],
      },
    ],
  });

  revalidatePath("/verification");
  return result;
}
