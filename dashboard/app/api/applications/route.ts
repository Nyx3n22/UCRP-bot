/**
 * dashboard/app/api/applications/route.ts
 * GET: pobieranie aplikacji z filtrowaniem. PATCH: decyzja recenzenta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasAnyPermission } from '@/lib/permissions';

// Zgodnie z botem: podania rozpatruje rekrutacja (REVIEW_APPLICATIONS) albo
// Support/Administracja w górę hierarchii.
const REVIEW_KEYS = ['REVIEW_APPLICATIONS', 'SUPPORT', 'ADMINISTRATOR'];
import { addGuildMemberRole, sendUserDm } from '@/lib/discord';

// Lokalne enumy zamiast importu z @prisma/client — unikamy problemów
// gdy prisma generate jeszcze nie wygenerował typów (np. świeży build).
type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS_CLARIFICATION';

// Frontend wysyła małe litery (?status=pending) - mapujemy na enumy.
// Bez tego filtr nigdy nie pasował i API zawsze zwracało WSZYSTKO.
const STATUS_MAP: Record<string, ApplicationStatus | null> = {
  all: null,
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
};

const ROLE_ON_ACCEPT: Record<string, string> = {
  STUDENT: 'STUDENT_ROLE',
  WYKLADOWCA: 'WYKLADOWCA_ROLE',
  ADMINISTRACJA: 'ADMINISTRACJA_ROLE',
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.discordId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hasPerm = await hasAnyPermission(session.user.discordId, REVIEW_KEYS);
    if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const statusParam = (req.nextUrl.searchParams.get('status') || 'all').toLowerCase();
    const mapped = STATUS_MAP[statusParam];

    const where: any = mapped ? { status: mapped } : {};

    const applications = await prisma.application.findMany({
      where,
      include: {
        reviews: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return NextResponse.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.discordId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const reviewerId = session.user.discordId;
    const hasPerm = await hasAnyPermission(reviewerId, REVIEW_KEYS);
    if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { applicationId, decision, feedback } = body as {
      applicationId?: string;
      decision?: string;
      feedback?: string;
    };

    if (!applicationId || (decision !== 'ACCEPTED' && decision !== 'REJECTED')) {
      return NextResponse.json({ error: 'Podaj applicationId i decision (ACCEPTED/REJECTED).' }, { status: 400 });
    }

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) return NextResponse.json({ error: 'Nie znaleziono podania.' }, { status: 404 });
    if (application.status === 'ACCEPTED' || application.status === 'REJECTED') {
      return NextResponse.json({ error: 'To podanie zostało już rozpatrzone.' }, { status: 409 });
    }

    // reviewerId to FK do DiscordUser - recenzent z Dashboardu może nie mieć wiersza.
    await prisma.discordUser.upsert({
      where: { id: reviewerId },
      update: {},
      create: { id: reviewerId },
    });

    await prisma.applicationReview.create({
      data: {
        applicationId,
        reviewerId,
        decision: decision as ApplicationStatus,
        feedback: typeof feedback === 'string' && feedback.trim() ? feedback.trim().slice(0, 2000) : null,
      },
    });

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: decision as ApplicationStatus, reviewedById: reviewerId },
    });

    // Lustro logiki bota (applicationServiceV2.review): rola po akceptacji.
    if (decision === 'ACCEPTED') {
      const permissionKey = ROLE_ON_ACCEPT[application.type];
      if (permissionKey) {
        const binding = await prisma.roleBinding.findFirst({ where: { permissionKey } });
        if (binding) {
          await addGuildMemberRole(application.userId, binding.discordRoleId, `Akceptacja podania ${application.type}`).catch(
            () => null
          );
        }
      }
      await sendUserDm(
        application.userId,
        `🎉 Twoje podanie (${application.type}) zostało **zaakceptowane**! Witamy na pokładzie.`
      ).catch(() => null);
    } else {
      await sendUserDm(
        application.userId,
        `❌ Twoje podanie (${application.type}) zostało odrzucone.` +
          (typeof feedback === 'string' && feedback.trim() ? `\nPowód: ${feedback.trim().slice(0, 1000)}` : '')
      ).catch(() => null);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error reviewing application:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
