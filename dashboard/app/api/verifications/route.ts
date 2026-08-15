/**
 * dashboard/app/api/verifications/route.ts
 * Endpoint do pobierania weryfikacji z filtrowaniem
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { ApplicationStatus, Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.discordId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Sprawdź uprawnienia
    const hasPerm = await hasPermission(session.user.discordId, 'REVIEW_APPLICATIONS');
    if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const statusParam = req.nextUrl.searchParams.get('status') || 'all';
    const isValidStatus = (Object.values(ApplicationStatus) as string[]).includes(statusParam);

    const where: Prisma.ApplicationWhereInput =
      statusParam === 'all' || !isValidStatus
        ? {}
        : { status: statusParam as ApplicationStatus };

    const verifications = await prisma.verificationAttempt.findMany({
      where,
      include: {
        manualReview: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return NextResponse.json(verifications);
  } catch (error) {
    console.error('Error fetching verifications:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
