"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const isApply = callbackUrl.startsWith("/apply");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card max-w-md w-full p-10 text-center">
        <p className="label-eyebrow mb-3">Uniwersytet Centralny RP</p>
        <h1 className="font-display text-3xl mb-2">{isApply ? "Podania rekrutacyjne" : "Panel Administracyjny"}</h1>
        <p className="text-parchment/60 text-sm mb-8">
          {isApply
            ? "Zaloguj się przez Discord, żeby złożyć podanie."
            : "Dostęp mają wyłącznie osoby z odpowiednią rolą na serwerze Discord."}
        </p>
        <button
          onClick={() => signIn("discord", { callbackUrl })}
          className="btn-primary w-full"
        >
          Zaloguj przez Discord
        </button>
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
