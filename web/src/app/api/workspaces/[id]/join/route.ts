import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  generateStudentAccessSecret,
  hashStudentAccessSecret,
  setStudentAccessCookie,
  studentAccessCookieName,
  verifyStudentAccessCookie,
  verifyWorkspaceJoinPin,
} from "@/lib/studentAccess";

export const dynamic = "force-dynamic";

const joinSchema = z.object({
  credential: z.string().trim().min(6).max(128),
  studentId: z.string().min(1).max(128),
  pin: z.string().regex(/^\d{4}$/),
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function accessExpiresAt(
  session: { mode: string; dueAt: Date | null },
  now: Date,
): Date {
  if (session.mode !== "homework") {
    return new Date(now.getTime() + DAY);
  }

  const hardCap = now.getTime() + 30 * DAY;
  const preferred = session.dueAt
    ? session.dueAt.getTime() + DAY
    : now.getTime() + 7 * DAY;

  // Even an overdue homework link gets a short, bounded window until the
  // teacher explicitly closes the session.
  return new Date(Math.min(hardCap, Math.max(now.getTime() + HOUR, preferred)));
}

function matchesSessionCredential(
  credential: string,
  joinCode: string,
  qrToken: string,
): boolean {
  return credential.toUpperCase() === joinCode.toUpperCase() || credential === qrToken;
}

/**
 * Claims one workspace for one browser.
 *
 * The public lesson code is only an entry credential. The actual access
 * credential is random, scoped to a single workspace, stored hashed in the DB,
 * and returned exclusively in an HttpOnly cookie.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ip = getClientIp(req.headers);
  // High ceiling for authenticated heartbeats from a whole class behind one
  // school NAT. Public code attempts receive a much stricter limit below.
  if (!checkRateLimit(`student-access:ip:${ip}`, 600)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  const workspace = await db.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      studentId: true,
      status: true,
      joinedAt: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: {
        select: {
          id: true,
          joinCode: true,
          qrToken: true,
          closedAt: true,
          mode: true,
          dueAt: true,
          workspaces: { select: { id: true } },
        },
      },
    },
  });
  if (!workspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (workspace.session.closedAt) {
    return NextResponse.json({ error: "session_closed" }, { status: 410 });
  }

  const now = new Date();
  const currentCookie = req.cookies.get(studentAccessCookieName(id))?.value;
  if (verifyStudentAccessCookie(currentCookie, workspace, now)) {
    await db.workspace.update({
      where: { id: workspace.id },
      data: {
        status: workspace.status === "submitted" ? undefined : "active",
        joinedAt: workspace.joinedAt ?? now,
        lastActivityAt: now,
      },
    });
    return NextResponse.json({ ok: true, workspaceId: workspace.id });
  }

  if (
    !checkRateLimit(`student-join:ip:${ip}`, 60) ||
    !checkRateLimit(`student-join:workspace:${id}`, 10)
  ) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(rawBody);
  if (!parsed.success) {
    if (currentCookie) {
      return NextResponse.json({ error: "access_revoked" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (
    workspace.studentId !== parsed.data.studentId ||
    !matchesSessionCredential(
      parsed.data.credential,
      workspace.session.joinCode,
      workspace.session.qrToken,
    ) ||
    !verifyWorkspaceJoinPin(
      workspace.id,
      parsed.data.pin,
      workspace.session.workspaces.map((item) => item.id),
    )
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (
    workspace.studentAccessHash &&
    workspace.studentAccessExpiresAt &&
    workspace.studentAccessExpiresAt.getTime() > now.getTime()
  ) {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const secret = generateStudentAccessSecret();
  const expires = accessExpiresAt(workspace.session, now);
  const hash = hashStudentAccessSecret(secret);

  const claimed = await db.$transaction(async (tx) => {
    const result = await tx.workspace.updateMany({
      where: {
        id: workspace.id,
        OR: [
          { studentAccessHash: null },
          { studentAccessExpiresAt: null },
          { studentAccessExpiresAt: { lte: now } },
        ],
      },
      data: {
        studentAccessHash: hash,
        studentAccessExpiresAt: expires,
        claimedAt: now,
        status: workspace.status === "submitted" ? undefined : "active",
        joinedAt: workspace.joinedAt ?? now,
        lastActivityAt: now,
      },
    });

    if (result.count === 1) {
      await tx.activityLog.create({
        data: {
          sessionId: workspace.session.id,
          workspaceId: workspace.id,
          actor: "student",
          kind: "joined",
        },
      });
    }

    return result.count === 1;
  });

  if (!claimed) {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const response = NextResponse.json({ ok: true, workspaceId: workspace.id });
  setStudentAccessCookie(response, workspace.id, secret, expires);
  return response;
}
