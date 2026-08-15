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

export default function VerificationsPage() {
  const [verifications, setVerifications] = useState<VerificationAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('pending');

  useEffect(() => {
    fetchVerifications();
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

  const getStatusBadge = (status: string) => {
    const statusMap = {
      PENDING_CAPTCHA: { color: 'bg-blue-500', label: '⏳ Czeka na captchę' },
      PENDING_ROBLOX: { color: 'bg-blue-500', label: '⏳ Czeka na Roblox' },
      PENDING_AI_REVIEW: { color: 'bg-yellow-500', label: '🤖 Analiza AI' },
      PENDING_MANUAL_REVIEW: { color: 'bg-yellow-600', label: '👤 Przegląd manualny' },
      VERIFIED: { color: 'bg-green-500', label: '✅ Zweryfikowana' },
      REJECTED: { color: 'bg-red-500', label: '❌ Odrzucona' },
      EXPIRED: { color: 'bg-gray-500', label: '⏰ Wygasła' },
    };
    const info = statusMap[status as keyof typeof statusMap] || { color: 'bg-gray-500', label: '?' };
    return <span className={`${info.color} text-white px-3 py-1 rounded text-sm font-bold`}>{info.label}</span>;
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">🔍 Zarządzanie weryfikacjami</h1>

      <div className="mb-6 flex gap-2">
        {(['all', 'pending', 'verified', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f === 'all' && 'Wszystkie'}
            {f === 'pending' && 'Oczekujące'}
            {f === 'verified' && 'Zweryfikowane'}
            {f === 'rejected' && 'Odrzucone'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400">Ładowanie...</p>
      ) : verifications.length === 0 ? (
        <p className="text-gray-400">Brak weryfikacji do wyświetlenia</p>
      ) : (
        <div className="space-y-4">
          {verifications.map((v) => (
            <div key={v.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold">
                    {v.firstNameIC} {v.lastNameIC}
                  </h3>
                  <p className="text-gray-400 text-sm">Discord: &lt;@{v.userId}&gt;</p>
                  <p className="text-gray-400 text-sm">Roblox: {v.robloxUsername}</p>
                </div>
                {getStatusBadge(v.status)}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <span className="text-gray-400">Data urodzenia:</span>
                  <p className="text-white">{new Date(v.birthDateIC).toLocaleDateString('pl-PL')}</p>
                </div>
                <div>
                  <span className="text-gray-400">Data weryfikacji:</span>
                  <p className="text-white">{new Date(v.createdAt).toLocaleString('pl-PL')}</p>
                </div>
              </div>

              {v.aiScore !== undefined && (
                <div className="mb-4 bg-gray-900 p-3 rounded">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">Score AI:</span>
                    <span className={`font-bold ${v.aiScore > 0.8 ? 'text-green-400' : v.aiScore > 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(v.aiScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  {v.aiFlags && v.aiFlags.length > 0 && (
                    <div className="text-sm text-red-400">
                      🚩 {v.aiFlags.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {v.manualReview && (
                <div className="text-sm text-gray-400 bg-gray-900 p-3 rounded">
                  <p className="font-bold mb-1">Decyzja: {v.manualReview.decision === 'APPROVED' ? '✅ Zaakceptowana' : '❌ Odrzucona'}</p>
                  {v.manualReview.notes && <p>Notatka: {v.manualReview.notes}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
