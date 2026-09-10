"use client";

import { useEffect, useState } from "react";

/** Żywy zegar + data w hero dashboardu. */
export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-24" />
        <div className="skeleton h-4 w-32" />
      </div>
    );
  }

  const time = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex items-center gap-4">
      <p className="font-mono text-2xl tabular-nums text-brasslight" suppressHydrationWarning>
        {time}
      </p>
      <span aria-hidden className="h-8 w-px bg-line" />
      <p className="max-w-[12rem] text-xs capitalize leading-snug text-parchment/50">{date}</p>
    </div>
  );
}
