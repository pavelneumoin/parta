import { headers } from "next/headers";

/**
 * Текущий URL для построения ссылок для QR.
 * В dev — http://localhost:3030; в prod — Host из заголовков.
 */
export async function baseUrl(): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3030";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
