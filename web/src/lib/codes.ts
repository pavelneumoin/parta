// Парта · генерация коротких join-кодов для уроков и токенов учеников.

const CODE_ALPHABET = "23456789"; // без 0/1 и букв — диктовать вслух легко

/**
 * 6-значный код урока — то, что учитель диктует классу.
 * Цифры 2–9 (без 0 и 1) — чтобы по голосу не путать.
 */
export function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Legacy-идентификатор ученика. Не использовать для авторизации.
 * Доступ к работе выдаётся workspace-scoped через HttpOnly cookie.
 * В Node 18+ и современных браузерах globalThis.crypto.randomUUID доступен всегда.
 */
export function generateAnonToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * QR-токен — длинный URL-safe код для прямого входа через ссылку/QR.
 */
export function generateQrToken(): string {
  return generateAnonToken();
}
