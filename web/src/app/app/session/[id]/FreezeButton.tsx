"use client";

import { useEffect, useState } from "react";

export function FreezeButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (until == null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setUntil(null);
    }, 250);
    return () => clearInterval(id);
  }, [until]);

  const freeze = async (seconds: number) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/freeze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      const data = await r.json();
      if (r.ok) {
        if (data.freezeUntil) {
          setUntil(new Date(data.freezeUntil).getTime());
        } else {
          setUntil(null);
          setRemaining(0);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (until && remaining > 0) {
    return (
      <button
        onClick={() => freeze(0)}
        disabled={busy}
        className="px-4 py-2.5 rounded-xl bg-blue text-paper font-medium hover:opacity-90 transition flex items-center gap-2"
        title="Снять заморозку"
      >
        <span>❄️ {remaining}с</span>
        <span className="text-paper/70 text-xs">разморозить</span>
      </button>
    );
  }

  return (
    <div className="relative group">
      <button
        disabled={busy}
        className="px-4 py-2.5 rounded-xl border border-rule hover:bg-chalk transition disabled:opacity-60"
        title="Заморозить класс — ученики не смогут писать"
      >
        ❄️ Заморозить
      </button>
      <div className="absolute right-0 top-full mt-1 hidden group-hover:flex hover:flex flex-col gap-1 p-1 rounded-lg bg-paper border border-rule shadow-lg z-20 min-w-max">
        {[15, 30, 60, 120].map((s) => (
          <button
            key={s}
            onClick={() => freeze(s)}
            disabled={busy}
            className="px-3 py-1.5 rounded text-sm text-left hover:bg-chalk transition"
          >
            на {s} сек
          </button>
        ))}
      </div>
    </div>
  );
}
