"use client";

import { useState } from "react";
import JSZip from "jszip";

type Workspace = {
  id: string;
  studentName: string;
  previewUpdatedAt: string | null;
  previewPageIndex: number | null;
};

type StateResp = {
  workspaces: Workspace[];
};

/**
 * Скачать архив PNG-превью всех workspace'ов класса.
 *
 * Качество — то, что есть на сервере (200×280 снимок с клиента). Если учитель
 * хочет деталь — открывает плитку → «↓ PNG» из учительского режима.
 */
export function ExportClassButton({
  sessionId,
  className,
  lessonTitle,
}: {
  sessionId: string;
  className: string;
  lessonTitle: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setProgress("Получаю список учеников…");
    try {
      const sr = await fetch(`/api/sessions/${sessionId}/state`, {
        cache: "no-store",
      });
      if (!sr.ok) throw new Error(`state HTTP ${sr.status}`);
      const data = (await sr.json()) as StateResp;

      const ready = data.workspaces.filter((w) => w.previewUpdatedAt);
      if (ready.length === 0) {
        alert("Превью пока нет — никто ещё не писал.");
        return;
      }

      const zip = new JSZip();
      let done = 0;
      for (const w of ready) {
        setProgress(`Скачиваю ${done + 1} из ${ready.length}…`);
        try {
          const pr = await fetch(
            `/api/workspaces/${w.id}/preview?page=${w.previewPageIndex ?? 0}&v=${encodeURIComponent(w.previewUpdatedAt!)}`,
            { cache: "no-store" },
          );
          if (!pr.ok) continue;
          const blob = await pr.blob();
          const safe = w.studentName.replace(/[\\/:*?"<>|]/g, "_");
          zip.file(`${safe}.png`, blob);
        } catch {
          /* пропускаем — продолжаем со следующего */
        }
        done++;
      }

      setProgress("Пакую архив…");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      const safeName = `${className} — ${lessonTitle}`.replace(/[\\/:*?"<>|]/g, "_");
      a.href = url;
      a.download = `${safeName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      alert("Ошибка экспорта: " + (e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="px-4 py-2.5 rounded-xl border border-rule hover:bg-rule/40 transition disabled:opacity-60"
      title="Скачать все работы класса как ZIP-архив PNG"
    >
      {busy ? progress ?? "…" : "↓ Класс ZIP"}
    </button>
  );
}
