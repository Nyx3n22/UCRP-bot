"use server";

import { sendChannelMessage } from "@/lib/discord";

export async function sendPlainMessage(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const content = String(formData.get("content") ?? "").trim().slice(0, 2000);
  if (!channelId || !content) return;
  const result = await sendChannelMessage(channelId, { content });
  if (!result.ok) console.error("[send-message] sendPlainMessage failed:", result.error);
}

export async function sendEmbedMessage(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 256);
  const description = String(formData.get("description") ?? "").trim().slice(0, 4000);
  const colorRaw = String(formData.get("color") ?? "").trim().replace("#", "");
  const image = String(formData.get("image") ?? "").trim();
  const footer = String(formData.get("footer") ?? "").trim().slice(0, 2048);
  if (!channelId || !title || !description) return;

  const color = /^[0-9a-fA-F]{6}$/.test(colorRaw) ? parseInt(colorRaw, 16) : 0x1a2a6c;

  const embed: Record<string, unknown> = { title, description, color };
  if (image) embed.image = { url: image };
  if (footer) embed.footer = { text: footer };

  const result = await sendChannelMessage(channelId, { embeds: [embed] });
  if (!result.ok) console.error("[send-message] sendEmbedMessage failed:", result.error);
}
