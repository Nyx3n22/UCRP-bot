import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/apply");

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-6 py-10">
      <header className="mb-10 flex justify-between items-center">
        <Link href="/apply">
          <p className="label-eyebrow">Uniwersytet Centralny RP</p>
          <h1 className="font-display text-2xl">Podania rekrutacyjne</h1>
        </Link>
        <div className="text-right text-xs text-parchment/50">
          Zalogowano jako<br /><span className="text-parchment/80">{session.user.name}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
