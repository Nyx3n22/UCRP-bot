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

export default function ApplicationsReviewPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');

  useEffect(() => {
    fetchApplications();
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

  const getTypeLabel = (type: string) => {
    const map = {
      STUDENT: '🎓 Student',
      WYKLADOWCA: '👨‍🏫 Wykładowca',
      ADMINISTRACJA: '⚙️ Administracja',
    };
    return map[type as keyof typeof map] || type;
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      PENDING: { color: 'bg-yellow-600', label: '⏳ Oczekuje' },
      ACCEPTED: { color: 'bg-green-500', label: '✅ Zaakceptowana' },
      REJECTED: { color: 'bg-red-500', label: '❌ Odrzucona' },
      NEEDS_CLARIFICATION: { color: 'bg-blue-600', label: '❓ Wymaga wyjaśnienia' },
    };
    const info = statusMap[status as keyof typeof statusMap] || { color: 'bg-gray-500', label: '?' };
    return <span className={`${info.color} text-white px-3 py-1 rounded text-sm font-bold`}>{info.label}</span>;
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">📋 Recenzja aplikacji</h1>

      <div className="mb-6 flex gap-2">
        {(['all', 'pending', 'accepted', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded font-bold transition ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f === 'all' && 'Wszystkie'}
            {f === 'pending' && 'Oczekujące'}
            {f === 'accepted' && 'Zaakceptowane'}
            {f === 'rejected' && 'Odrzucone'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400">Ładowanie...</p>
      ) : applications.length === 0 ? (
        <p className="text-gray-400">Brak aplikacji do wyświetlenia</p>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div key={app.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex gap-2 items-center">
                    <span className="text-lg font-bold">{getTypeLabel(app.type)}</span>
                    {getStatusBadge(app.status)}
                  </div>
                  <p className="text-gray-400 text-sm">Discord: &lt;@{app.userId}&gt;</p>
                  <p className="text-gray-400 text-sm">Data: {new Date(app.createdAt).toLocaleString('pl-PL')}</p>
                </div>
              </div>

              <div className="bg-gray-900 p-3 rounded mb-4">
                <h4 className="font-bold mb-2">Treść aplikacji:</h4>
                <div className="text-sm text-gray-300 max-h-48 overflow-y-auto">
                  {Object.entries(app.answers).map(([key, value]) => (
                    <p key={key} className="mb-2">
                      <span className="text-gray-500">{key}:</span> {value}
                    </p>
                  ))}
                </div>
              </div>

              {app.aiScore !== undefined && (
                <div className="mb-4 bg-gray-900 p-3 rounded">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">🤖 AI Analiza:</span>
                    <span
                      className={`font-bold px-3 py-1 rounded ${
                        app.aiScore > 0.8
                          ? 'bg-green-600 text-green-100'
                          : app.aiScore > 0.5
                          ? 'bg-yellow-600 text-yellow-100'
                          : 'bg-red-600 text-red-100'
                      }`}
                    >
                      {(app.aiScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  {app.aiFlags && app.aiFlags.length > 0 && (
                    <div className="text-sm text-red-400">
                      🚩 Flagi: {app.aiFlags.join(', ')}
                    </div>
                  )}
                  {app.aiAnalysis && (
                    <div className="text-sm text-gray-400 mt-2 p-2 bg-gray-800 rounded">
                      {app.aiAnalysis}
                    </div>
                  )}
                </div>
              )}

              {app.status === 'PENDING' && (
                <div className="flex gap-2">
                  <button className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded font-bold">✅ Zaakceptuj</button>
                  <button className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded font-bold">❌ Odrzuć</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
