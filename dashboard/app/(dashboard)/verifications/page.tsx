/**
 * dashboard/app/(dashboard)/verifications/page.tsx
 * Panel do zarządzania weryfikacjami — przegląd, filtrowanie, recenzja
 */

'use client';

import { useEffect, useState } from 'react';

interface VerificationAttempt {
  id: string;
  userId: string;
  firstNameIC: string;
  lastNameIC: string;
  birthDateIC: string;
  robloxUsername: string;
  status: 'PENDING_CAPTCHA' | 'PENDING_ROBLOX' | 'PENDING_AI_REVIEW' | 'PENDING_MANUAL_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  aiScore?: number;
  aiFlags?: string[];
  createdAt: string;
  manualReview?: {
    decision: string;
    notes?: string;
    createdAt: string;
  };
}

const STATUS_BADGES: Record<string, { cls: string; label: string }> = {
  PENDING_CAPTCHA: { cls: 'badge badge-blue', label: '⏳ Czeka na captchę' },
  PENDING_ROBLOX: { cls: 'badge badge-blue', label: '⏳ Czeka na Roblox' },
  PENDING_AI_REVIEW: { cls: 'badge badge-amber', label: '🤖 Analiza AI' },
  PENDING_MANUAL_REVIEW: { cls: 'badge badge-amber', label: '👤 Przegląd manualny' },
  VERIFIED: { cls: 'badge badge-green', label: '✅ Zweryfikowana' },
  REJECTED: { cls: 'badge badge-red', label: '❌ Odrzucona' },
  EXPIRED: { cls: 'badge badge-gray', label: '⏰ Wygasła' },
};

const FILTERS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'pending', label: 'Oczekujące' },
  { id: 'verified', label: 'Zweryfikowane' },
  { id: 'rejected', label: 'Odrzucone' },
] as const;

export default function VerificationsPage() {
  const [verifications, setVerifications] = useState<VerificationAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('pending');

  useEffect(() => {
    fetchVerifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/verifications?status=${filter}`);
      if (!response.ok) throw new Error('Błąd pobierania weryfikacji');
      const data = await response.json();
      setVerifications(data);
    } catch (error) {
      console.error('Błąd:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="label-eyebrow mb-2">Dane</p>
      <h1 className="mb-2 font-display text-3xl">Weryfikacje</h1>
      <p className="mb-8 max-w-2xl text-sm text-parchment/55">
        Wszystkie próby weryfikacji IC — od captchy, przez analizę AI, po przegląd manualny. Filtr domyślnie
        pokazuje oczekujące.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`pill ${filter === f.id ? 'pill-active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card flex items-center gap-3 p-6 text-sm text-parchment/50">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brass/30 border-t-brass" />
          Ładowanie weryfikacji…
        </div>
      ) : verifications.length === 0 ? (
        <div className="card p-6 text-sm text-parchment/45">Brak weryfikacji do wyświetlenia.</div>
      ) : (
        <div className="space-y-4">
          {verifications.map((v) => {
            const badge = STATUS_BADGES[v.status] ?? { cls: 'badge badge-gray', label: '?' };
            return (
              <div key={v.id} className="card p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg leading-snug">
                      {v.firstNameIC} {v.lastNameIC}
                    </h3>
                    <p className="text-xs text-parchment/45">
                      Discord: <span className="font-mono">&lt;@{v.userId}&gt;</span> · Roblox:{' '}
                      <span className="text-parchment/70">{v.robloxUsername}</span>
                    </p>
                  </div>
                  <span className={badge.cls}>{badge.label}</span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-parchment/35">Data urodzenia</p>
                    <p>{new Date(v.birthDateIC).toLocaleDateString('pl-PL')}</p>
                  </div>
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.14em] text-parchment/35">Data weryfikacji</p>
                    <p>{new Date(v.createdAt).toLocaleString('pl-PL')}</p>
                  </div>
                </div>

                {v.aiScore !== undefined && (
                  <div className="mb-4 rounded-lg border border-line/70 bg-ink/60 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-parchment/50">🤖 Wynik analizy AI</span>
                      <span
                        className={
                          v.aiScore > 0.8 ? 'text-sm font-bold text-green-400' : v.aiScore > 0.5 ? 'text-sm font-bold text-yellow-400' : 'text-sm font-bold text-red-400'
                        }
                      >
                        {(v.aiScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    {v.aiFlags && v.aiFlags.length > 0 && (
                      <p className="text-xs text-[#eb8ea4]">🚩 {v.aiFlags.join(', ')}</p>
                    )}
                  </div>
                )}

                {v.manualReview && (
                  <div className="rounded-lg border border-line/70 bg-ink/60 p-3 text-sm">
                    <p className="mb-1 font-semibold">
                      Decyzja: {v.manualReview.decision === 'APPROVED' ? '✅ Zaakceptowana' : '❌ Odrzucona'}
                    </p>
                    {v.manualReview.notes && <p className="text-parchment/55">Notatka: {v.manualReview.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
