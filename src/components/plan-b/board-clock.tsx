"use client";
// London time, departure-board style. Rendered after mount to avoid a server/client time mismatch.
import { useEffect, useState } from "react";

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function BoardClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="pb-board font-mono text-lg tabular-nums" aria-label="London time">
      {now ?? "--:--:--"}
    </span>
  );
}
