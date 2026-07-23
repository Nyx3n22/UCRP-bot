"use client";

import { useState, useTransition } from "react";
import { publishVerificationPanel } from "./actions";

export default function PublishVerificationButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  return (
    <div>
      <button
        className="btn-primary"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const res = await publishVerificationPanel();
            setResult(res);
          });
        }}
      >
        {isPending ? "Publikuję…" : "Opublikuj panel weryfikacji"}
      </button>

      {result?.ok && <p className="text-sm text-brass mt-3">✅ Panel opublikowany na kanale weryfikacji.</p>}
      {result && !result.ok && <p className="text-sm text-burgundy mt-3">❌ Błąd: {result.error}</p>}
    </div>
  );
}
