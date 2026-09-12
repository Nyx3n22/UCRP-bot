/**
 * dashboard/app/api/verifications/route.ts
 * Endpoint do pobierania weryfikacji z filtrowaniem
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { hasAnyPermission } from '@/lib/permissions';

// Zgodnie z botem: weryfikacje rozpatruje Support i wyżej (albo legacy MODERATE).
const REVIEW_KEYS = ['MODERATE', 'SUPPORT'];

// Lokalne enumy zamiast importu z @prisma/client — unikamy problemów
// gdy prisma generate jeszcze nie wygenerował typów (np. świeży build).
type VerificationStatus = 'PENDING_CAPTCHA' | 'PENDING_ROBLOX' | 'PENDING_AI_REVIEW' | 'PENDING_MANUAL_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.discordId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Sprawdź uprawnienia
    const hasPerm = await hasAnyPermission(session.user.discordId, REVIEW_KEYS);
    if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Frontend wysyła małe litery (?status=pending) - mapujemy na enumy.
    // 'pending' to kolejka do ręcznej recenzji (to ona jest "do zrobienia").
    const statusParam = (req.nextUrl.searchParams.get('status') || 'all').toLowerCase();
    const STATUS_MAP: Record<string, VerificationStatus | null> = {
      all: null,
      pending: 'PENDING_MANUAL_REVIEW',
      verified: 'VERIFIED',
      rejected: 'REJECTED',
    };
    const mapped = STATUS_MAP[statusParam];

    const where: any = mapped ? { status: mapped } : {};
    
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
