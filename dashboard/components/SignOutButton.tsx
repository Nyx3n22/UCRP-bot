"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-line px-2.5 py-1 text-[0.7rem] font-semibold text-parchment/60 transition-colors hover:border-burgundy hover:text-parchment"
    >
      Wyloguj
    </button>
  );
}
