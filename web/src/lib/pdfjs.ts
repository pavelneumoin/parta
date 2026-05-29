"use client";

// Тонкая обёртка над pdfjs-dist: указываем worker один раз на клиенте.
import * as pdfjsLib from "pdfjs-dist";

let configured = false;
export function getPdfJs() {
  if (!configured && typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    configured = true;
  }
  return pdfjsLib;
}
