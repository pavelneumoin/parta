import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Время старта процесса — считается один раз при инициализации модуля. */
const STARTED_AT = Date.now();

/**
 * GET /api/health
 *
 * Минимальный healthcheck для мониторинга и балансировщиков.
 * Проверяет:
 *  - доступность БД (SELECT 1)
 *  - uptime процесса
 *
 * Ответ 200 → всё OK.
 * Ответ 503 → БД недоступна (деградация).
 */
export async function GET() {
  const uptimeMs = Date.now() - STARTED_AT;

  let dbStatus: "ok" | "error" = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      uptime_ms: uptimeMs,
      uptime_s: Math.floor(uptimeMs / 1000),
      db: dbStatus,
      ts: new Date().toISOString(),
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
