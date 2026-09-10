"use client";

import { useState } from "react";

/**
 * Logo aplikacji — czyta `/logo.png` z `dashboard/public/`.
 * Jeśli plik nie istnieje / nie ładuje się, pokazuje awaryjny monogram "UC",
 * żeby layout nigdy nie sypał się pustym miejscem po logo.
 *
 * Jak podmienić logo na własne: nadpisz plik `dashboard/public/logo.png`
 * (kwadrat, najlepiej 512×512 PNG z przezroczystością lub na granacie #101320).
 */
export default function AppLogo({
  size = 42,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-hidden
        className={`brand-crest ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      >
        UC
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Logo — Uniwersytet Centralny RP"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`brand-logo ${className}`}
      style={{ width: size, height: size }}
      // @ts-expect-error fetchpriority jest poprawnym atrybutem <img>, ale brakuje go w starszych @types/react
      fetchpriority={priority ? "high" : "auto"}
    />
  );
}
