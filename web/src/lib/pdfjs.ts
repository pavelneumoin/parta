"use client";

// Тонкая обёртка над pdfjs-dist: указываем worker один раз на клиенте.
let configured = false;
let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export async function getPdfJs() {
  if (typeof window === "undefined") {
    throw new Error("pdf.js is available only in the browser");
  }

  pdfJsPromise ??= import("pdfjs-dist");
  const pdfjsLib = await pdfJsPromise;
  if (!configured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    configured = true;
  }
  return pdfjsLib;
}
