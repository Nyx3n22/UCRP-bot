"use client";

import { useState, useTransition } from "react";
import { submitApplication } from "./actions";

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
      <div className="card card-accent p-10 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-brass/40 bg-brass/15 text-2xl">
          ✅
        </span>
        <p className="label-eyebrow mb-2">Wysłano</p>
        <h2 className="mb-2 font-display text-2xl">Podanie złożone</h2>
        <p className="mx-auto max-w-md text-sm text-parchment/55">
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
      className="card flex flex-col gap-5 p-8"
    >
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-parchment/75">
            {f.label}
            {f.required && <span className="ml-1 text-brass">*</span>}
          </label>
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

      {result && !result.ok && (
        <p className="rounded-lg border border-burgundy/60 bg-burgundy/15 px-4 py-3 text-sm text-[#eb8ea4]">
          ❌ {result.error}
        </p>
      )}

      <button type="submit" disabled={isPending} className="btn-primary self-start">
        {isPending ? "Wysyłanie…" : "Wyślij podanie"}
      </button>
    </form>
  );
}
