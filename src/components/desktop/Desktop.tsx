import { useEffect, useRef, useState } from "react";
import { bootMacCompanion } from "@/lib/grokbot/pet-shell";

export function Desktop() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.companion = "";
    const stop = bootMacCompanion({
      root: host.current,
      studioHref: "/atelier",
    });
    return () => {
      stop();
      delete document.documentElement.dataset.companion;
    };
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-transparent">
      <MacDesktop />
      <div ref={host} className="pointer-events-none absolute inset-0 z-20" />
    </div>
  );
}

function MacDesktop() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const day = now?.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }) ?? "";
  const time = now?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? "";

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 108%, #1d3a28 0%, transparent 52%), linear-gradient(180deg, #7eb6ea 0%, #b9c4f0 38%, #e8b4c8 72%, #c9a07a 100%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 flex h-7 items-center justify-between px-3 text-[12px] text-ink/80">
        <div className="flex items-center gap-3 font-medium">
          <span className="text-[13px]"></span>
          <canvas
            id="menu-bot"
            width={22}
            height={22}
            className="size-[22px] shrink-0"
            aria-hidden
          />
          <span>Finder</span>
          <span className="hidden opacity-70 sm:inline">File</span>
          <span className="hidden opacity-70 sm:inline">Edit</span>
          <span className="hidden opacity-70 sm:inline">View</span>
          <span className="hidden opacity-70 sm:inline">Go</span>
        </div>
        <div className="flex items-center gap-3 opacity-70">
          <span>{day}</span>
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}
