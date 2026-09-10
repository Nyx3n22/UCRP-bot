"use client";

import { useState } from "react";

/**
 * Awatar użytkownika — zdjęcie profilowe z Discorda (URL z sesji next-auth).
 * Jeśli brak URL-a albo obrazek nie ładuje się (np. wygasły hash awatara),
 * pokazuje inicjał jak dotychczas, żeby UI nigdy nie miał "dziury".
 */
export default function UserAvatar({
  src,
  name,
  size = 36,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full border border-brass/40 bg-brass/10 font-display text-brasslight ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      >
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Awatar Discord — ${name}`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border border-brass/40 bg-brass/10 object-cover ${className}`}
      style={{ width: size, height: size }}
      referrerPolicy="no-referrer"
    />
  );
}
