"use client";

import { useState } from "react";
import { closeSessionAction } from "../../lessons/actions";

export function CloseSessionButton({ sessionId }: { sessionId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="px-4 py-2.5 rounded-xl border border-rule hover:bg-rule/40 transition"
      >
        Закрыть урок
      </button>
    );
  }

  return (
    <form action={closeSessionAction} className="flex items-center gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <span className="text-sm text-dim">Закрыть для всех?</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="px-3 py-2 rounded-lg border border-rule hover:bg-rule/40 transition text-sm"
      >
        Нет
      </button>
      <button
        type="submit"
        className="px-3 py-2 rounded-lg bg-red text-paper hover:bg-red/80 transition text-sm"
      >
        Да, закрыть
      </button>
    </form>
  );
}
