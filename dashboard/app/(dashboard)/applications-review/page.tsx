/**
 * dashboard/app/(dashboard)/applications-review/page.tsx
 * Panel do recenzji aplikacji z filtrowaniem po statusie i AI score
 */

'use client';

import { useEffect, useState } from 'react';

interface Application {
  id: string;
  userId: string;
  type: 'STUDENT' | 'WYKLADOWCA' | 'ADMINISTRACJA';
  answers: Record<string, string>;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS_CLARIFICATION';
  aiScore?: number;
  aiFlags?: string[];
  aiAnalysis?: string;
  createdAt: string;
}

const STATUS_BADGES: Record<string, { cls: string; label: string }> = {
  PENDING: { cls: 'badge badge-amber', label: '⏳ Oczekuje' },
  ACCEPTED: { cls: 'badge badge-green', label: '✅ Zaakceptowana' },
  REJECTED: { cls: 'badge badge-red', label: '❌ Odrzucona' },
  NEEDS_CLARIFICATION: { cls: 'badge badge-blue', label: '❓ Wymaga wyjaśnienia' },
};

const TYPE_LABELS: Record<string, string> = {
  STUDENT: '🎓 Student',
  WYKLADOWCA: '👨‍🏫 Wykładowca',
  ADMINISTRACJA: '⚙️ Administracja',
};

const FILTERS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'pending', label: 'Oczekujące' },
  { id: 'accepted', label: 'Zaakceptowane' },
  { id: 'rejected', label: 'Odrzucone' },
] as const;

export default function ApplicationsReviewPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');
  const [actingId, setActingId] = useState<string | null>(null);

  const decide = async (app: Application, decision: 'ACCEPTED' | 'REJECTED') => {
    const feedback =
      decision === 'REJECTED'
        ? window.prompt('Powód odrzucenia (opcjonalnie, trafi do kandydata na DM):') ?? ''
        : '';
    const ok = window.confirm(
      decision === 'ACCEPTED'
        ? `Zaakceptować podanie ${app.type} od <@${app.userId}>?`
        : `Odrzucić podanie ${app.type} od <@${app.userId}>?`
    );
    if (!ok) return;
    try {
      setActingId(app.id);
      const res = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: app.id, decision, feedback }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Błąd decyzji');
      // Odśwież listę (przy filtrze 'pending' pozycja sama zniknie).
      await fetchApplications();
    } catch (error) {
      console.error('Błąd:', error);
      window.alert(`Nie udało się zapisać decyzji: ${error instanceof Error ? error.message : error}`);
    } finally {
      setActingId(null);
    }
  };

  useEffect(() => {
    fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/applications?status=${filter}`);
      if (!response.ok) throw new Error('Błąd pobierania aplikacji');
      const data = await response.json();
      setApplications(data);
    } catch (error) {
      console.error('Błąd:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="label-eyebrow mb-2">Dane</p>
      <h1 className="mb-2 font-display text-3xl">Recenzja aplikacji</h1>
      <p className="mb-8 max-w-2xl text-sm text-parchment/55">
        Podania kandydatów wraz z automatyczną analizą AI. Decyzję można podjąć bezpośrednio stąd — kandydat
        otrzyma odpowiedź na Discordzie.
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
          Ładowanie aplikacji…
        </div>
      ) : applications.length === 0 ? (
        <div className="card p-6 text-sm text-parchment/45">Brak aplikacji do wyświetlenia.</div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const badge = STATUS_BADGES[app.status] ?? { cls: 'badge badge-gray', label: '?' };
            return (
              <div key={app.id} className="card p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg">{TYPE_LABELS[app.type] ?? app.type}</span>
                      <span className={badge.cls}>{badge.label}</span>
                    </div>
                    <p className="text-xs text-parchment/45">
                      Discord: <span className="font-mono">&lt;@{app.userId}&gt;</span> ·{' '}
                      {new Date(app.createdAt).toLocaleString('pl-PL')}
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border border-line/70 bg-ink/60 p-4">
                  <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-brass/80">
                    Treść aplikacji
                  </h4>
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1 text-sm text-parchment/75">
                    {Object.entries(app.answers).map(([key, value]) => (
                      <p key={key}>
                        <span className="text-parchment/40">{key}:</span> {value}
                      </p>
                    ))}
                  </div>
                </div>

                {app.aiScore !== undefined && (
                  <div className="mb-4 rounded-lg border border-line/70 bg-ink/60 p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-parchment/50">🤖 Analiza AI</span>
                      <span
                        className={
                          app.aiScore > 0.8
                            ? 'badge badge-green'
                            : app.aiScore > 0.5
                              ? 'badge badge-amber'
                              : 'badge badge-red'
                        }
                      >
                        {(app.aiScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    {app.aiFlags && app.aiFlags.length > 0 && (
                      <p className="mt-1 text-xs text-[#eb8ea4]">🚩 Flagi: {app.aiFlags.join(', ')}</p>
                    )}
                    {app.aiAnalysis && (
                      <p className="mt-2 rounded-md border border-line/60 bg-panel/70 p-2 text-xs text-parchment/55">
                        {app.aiAnalysis}
                      </p>
                    )}
                  </div>
                )}

                {app.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(app, 'ACCEPTED')}
                      disabled={actingId === app.id}
                      className="btn-success flex-1 text-sm"
                    >
                      ✅ Zaakceptuj
                    </button>
                    <button
                      onClick={() => decide(app, 'REJECTED')}
                      disabled={actingId === app.id}
                      className="btn-danger flex-1 text-sm"
                    >
                      ❌ Odrzuć
                    </button>
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
