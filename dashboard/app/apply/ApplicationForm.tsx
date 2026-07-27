"use client";

import { useState, useTransition } from "react";
import { submitApplication } from "../actions";

type Field = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  options?: { value: string; label: string }[];
  required?: boolean;
};

export default function ApplicationForm({
  type,
  fields,
}: {
  type: "STUDENT" | "WYKLADOWCA" | "ADMINISTRACJA";
  fields: Field[];
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  if (result?.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="label-eyebrow mb-2 text-brass">Wysłano</p>
        <h2 className="font-display text-xl mb-2">Podanie złożone</h2>
        <p className="text-parchment/60 text-sm">
          Twoje podanie zostało zapisane i przekazane do rozpatrzenia. Otrzymasz wiadomość na Discordzie, gdy
          administracja podejmie decyzję.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const answers: Record<string, string> = {};
        for (const f of fields) {
          answers[f.label] = String(formData.get(f.name) ?? "");
        }
        startTransition(async () => {
          const res = await submitApplication(type, answers);
          setResult(res);
        });
      }}
      className="card p-8 flex flex-col gap-5"
    >
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <label className="text-sm text-parchment/70">{f.label}</label>
          {f.type === "textarea" ? (
            <textarea name={f.name} rows={4} required={f.required} />
          ) : f.type === "select" ? (
            <select name={f.name} required={f.required}>
              <option value="">Wybierz…</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input name={f.name} type={f.type} required={f.required} />
          )}
        </div>
      ))}

      {result && !result.ok && <p className="text-sm text-burgundy">❌ {result.error}</p>}

      <button type="submit" disabled={isPending} className="btn-primary self-start">
        {isPending ? "Wysyłanie…" : "Wyślij podanie"}
      </button>
    </form>
  );
}
