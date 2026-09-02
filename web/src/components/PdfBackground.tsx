"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getPdfJs } from "@/lib/pdfjs";

type Props = {
  /** URL PDF; авторизация выполняется сервером через HttpOnly cookie. */
  url: string;
  /** 0-based номер страницы. */
  pageIndex: number;
  className?: string;
  /** Внешний ref для snapshot. */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /** Сообщает фактическое соотношение сторон PDF-страницы (width / height). */
  onAspectRatioChange?: (ratio: number) => void;
  /** Дополнительное backing-store качество при zoom; CSS-размер не меняет. */
  qualityScale?: number;
};

type Status = "idle" | "loading" | "ready" | "error";

export function PdfBackground({
  url,
  pageIndex,
  className,
  canvasRef: externalCanvasRef,
  onAspectRatioChange,
  qualityScale = 1,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<unknown>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (externalCanvasRef) externalCanvasRef.current = canvasRef.current;
  });

  // загрузка PDF документа
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMsg(null);

    (async () => {
      try {
        const pdfjs = await getPdfJs();
        // log для диагностики у пользователя
        // (видно в DevTools → Console)
        console.info("[PdfBackground] loading", { url, pageIndex });

        const task = pdfjs.getDocument({
          url,
          withCredentials: false,
        });
        const doc = await task.promise;
        if (cancelled) return;
        console.info("[PdfBackground] loaded", { numPages: doc.numPages });
        pdfDocRef.current = doc;
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message || String(e);
        console.error("[PdfBackground] load failed:", msg, e);
        setErrorMsg(msg);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, retryNonce]);

  // рендер текущей страницы
  useEffect(() => {
    if (status !== "ready") return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    const render = async () => {
      const doc = pdfDocRef.current as { getPage: (n: number) => Promise<unknown>; numPages: number } | null;
      if (!doc) return;
      const safePageIndex = Math.max(0, Math.min(pageIndex, doc.numPages - 1));
      try {
        const page = (await doc.getPage(safePageIndex + 1)) as {
          getViewport: (opts: { scale: number }) => { width: number; height: number };
          render: (opts: unknown) => { cancel: () => void; promise: Promise<void> };
        };
        if (cancelled) return;

        const dpr = Math.min(
          3,
          Math.min(window.devicePixelRatio || 1, 2) *
            Math.max(1, qualityScale),
        );
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw === 0 || ch === 0) return;

        const base = page.getViewport({ scale: 1 });
        const aspectRatio = base.width / base.height;
        if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
          onAspectRatioChange?.(aspectRatio);
        }
        const scale = cw / base.width;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // pdf.js сбрасывает transform контекста в beginDrawing, поэтому
        // ctx.setTransform(dpr, ...) здесь не работает надёжно на Retina.
        // Передаём output transform самому renderer: CSS-размер остаётся
        // viewport.width/height, а backing store получает чёткие dpr-пиксели.
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        await renderTask.promise;
        console.info("[PdfBackground] page rendered", { pageIndex: safePageIndex });
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message || String(e);
        // render exceptions для cancelled task — не показываем
        if (msg.toLowerCase().includes("cancel")) return;
        console.error("[PdfBackground] render failed:", msg, e);
        setErrorMsg(msg);
        setStatus("error");
      }
    };
    render();

    const ro = new ResizeObserver(() => {
      if (renderTask) renderTask.cancel();
      render();
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
      ro.disconnect();
    };
  }, [status, pageIndex, onAspectRatioChange, qualityScale]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  return (
    <div ref={containerRef} className={`${className ?? ""} relative`}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ pointerEvents: "none" }}
      />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-lg bg-toolbar/85 text-paper text-sm">
            Загружаю PDF…
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-auto">
          <div className="max-w-md rounded-xl bg-paper border border-red/30 shadow-lg p-5 text-center">
            <div className="text-3xl mb-2">📄</div>
            <h3 className="font-semibold mb-2">PDF не загрузился</h3>
            <p className="text-sm text-dim mb-3 break-all">{errorMsg}</p>
            <p className="text-xs text-dim mb-3">
              Попробуйте обновить страницу. Если не помогло — продолжайте писать
              на чистом листе, учитель увидит работу.
            </p>
            <button
              onClick={retry}
              className="px-4 py-2 rounded-lg bg-ink text-paper text-sm hover:bg-toolbarHover transition"
            >
              ↻ Повторить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
