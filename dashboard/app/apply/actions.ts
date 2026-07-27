"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendChannelMessage } from "@/lib/discord";
import { generateApplicationAnalysis } from "@/lib/huggingface";
import { getRoleIdForPermission } from "@/lib/roleBindingHelpers";
import { redirect } from "next/navigation";

type ApplicationType = "STUDENT" | "WYKLADOWCA" | "ADMINISTRACJA";

export async function submitApplication(type: ApplicationType, answers: Record<string, string>) {
  const session = await getServerSession(authOptions);
  const discordId = (session?.user as { discordId?: string } | undefined)?.discordId;
  if (!discordId) redirect("/login?callbackUrl=/apply");

  const pending = await prisma.application.findFirst({ where: { userId: discordId, type, status: "PENDING" } });
  if (pending) {
    return { ok: false, error: "Masz już złożone i nierozpatrzone podanie tego typu." };
  }

  const rawText = Object.entries(answers)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  const aiAnalysis = await generateApplicationAnalysis(rawText);

  const application = await prisma.application.create({
    data: { userId: discordId, type, answers, aiAnalysis, status: "PENDING" },
  });

  const channelBinding = await prisma.channelBinding.findUnique({ where: { key: `APPLICATIONS_${type}` } });
  if (channelBinding) {
    const embeds: unknown[] = [
      {
        title: `📝 Nowe podanie — ${type}`,
        description: `Zgłaszający: <@${discordId}>`,
        fields: Object.entries(answers).map(([label, value]) => ({ name: label, value: value.slice(0, 1024) })),
        color: 0x1a2a6c,
        footer: { text: `ID podania: ${application.id}` },
      },
    ];

    if (aiAnalysis) {
      embeds.push({
        title: "🤖 Wstępna analiza AI",
        description: aiAnalysis.slice(0, 4000),
        color: 0xc9a15a,
      });
    }

    const components = [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Akceptuj", custom_id: `application_accept:${application.id}` },
          { type: 2, style: 4, label: "Odrzuć", custom_id: `application_reject:${application.id}` },
        ],
      },
    ];

    const reviewerRoleId = await getRoleIdForPermission("REVIEW_APPLICATIONS");
    await sendChannelMessage(channelBinding.channelId, {
      content: reviewerRoleId ? `<@&${reviewerRoleId}>` : undefined,
      embeds,
      components,
    });
  }

  return { ok: true, applicationId: application.id, hasChannel: Boolean(channelBinding) };
}
