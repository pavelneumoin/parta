import QRCode from "qrcode";

/**
 * Возвращает QR-код как data URL (svg в base64) — для прямой вставки в <img src>.
 * Используем SVG, потому что он чёткий на проекторе при любом масштабе.
 */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8,
    color: { dark: "#0c0d10", light: "#ffffff" },
  });
}
