/**
 * dashboard/app/api/applications/route.ts
 * Endpoint do pobierania aplikacji z filtrowaniem
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.discordId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    // Sprawdź uprawnienia
    const hasPerm = await hasPermission(session.user.discordId, 'REVIEW_APPLICATIONS'); // lub 'MODERATE' w verifications
    if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const status = req.nextUrl.searchParams.get('status') || 'all';

    const where = status === 'all' ? {} : { status };

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
