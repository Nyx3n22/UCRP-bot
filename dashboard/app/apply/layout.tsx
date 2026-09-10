import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/apply");

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="animate-enter mb-10 flex items-center justify-between gap-4 border-b border-line/70 pb-6">
        <Link href="/apply" className="group flex items-center gap-3">
          <span className="brand-crest">UC</span>
          <span className="leading-tight">
            <span className="label-eyebrow block">Uniwersytet Centralny RP</span>
            <span className="block font-display text-xl transition-colors group-hover:text-brasslight">
              Podania <span className="gold-text font-semibold italic">rekrutacyjne</span>
            </span>
          </span>
        </Link>
        <div className="card glass px-4 py-2 text-right text-xs text-parchment/40">
          Zalogowano jako
          <br />
          <span className="font-semibold text-parchment/80">{session.user.name}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
