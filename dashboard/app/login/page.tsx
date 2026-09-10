"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const isApply = callbackUrl.startsWith("/apply");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="brand-crest">UC</span>
          <span className="leading-tight">
            <span className="block font-display text-lg tracking-wide">Uniwersytet Centralny RP</span>
            <span className="block text-[0.6rem] uppercase tracking-[0.24em] text-parchment/40">
              {isApply ? "Rekrutacja" : "Panel administracyjny"}
            </span>
          </span>
        </div>

        <div className="card card-accent p-10 text-center">
          <p className="label-eyebrow mb-3">{isApply ? "Podania rekrutacyjne" : "Logowanie"}</p>
          <h1 className="mb-2 font-display text-3xl">
            {isApply ? "Złóż podanie" : "Panel Administracyjny"}
          </h1>
          <p className="mb-8 text-sm text-parchment/55">
            {isApply
              ? "Zaloguj się przez Discord, żeby złożyć podanie."
              : "Dostęp mają wyłącznie osoby z odpowiednią rolą na serwerze Discord."}
          </p>
          <button onClick={() => signIn("discord", { callbackUrl })} className="btn-primary w-full">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.8 13.8 0 0 0-.64 1.28 18.3 18.3 0 0 0-5.5 0 13.8 13.8 0 0 0-.64-1.28c-1.71.29-3.37.8-4.93 1.51A20.3 20.3 0 0 0 .1 18.06a19.9 19.9 0 0 0 6.07 3.03c.49-.66.93-1.37 1.3-2.1a12.9 12.9 0 0 1-2.05-.98l.5-.39a14.2 14.2 0 0 0 12.16 0l.5.39c-.66.39-1.34.72-2.05.98.37.73.81 1.44 1.3 2.1a19.9 19.9 0 0 0 6.07-3.03 20.3 20.3 0 0 0-3.58-13.69ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.09 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.09 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
            </svg>
            Zaloguj przez Discord
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-parchment/30">
          Uniwersytet Centralny RP · serwer roleplay
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
