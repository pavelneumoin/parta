import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const STUDENT_ACCESS_COOKIE_PREFIX = "parta_student_access_";
const MAX_STUDENT_COOKIES = 64;

export type WorkspaceAccessTarget = {
  id: string;
  studentAccessHash: string | null;
  studentAccessExpiresAt: Date | null;
  session: {
    teacherId: string;
  };
};

export type WorkspaceViewer =
  | { role: "teacher"; teacherId: string }
  | { role: "student"; workspaceId: string };

export function generateStudentAccessSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashStudentAccessSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function makeStudentAccessCookieValue(
  workspaceId: string,
  secret: string,
): string {
  return `${workspaceId}.${secret}`;
}

export function studentAccessCookieName(workspaceId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) {
    throw new Error("Invalid workspace id for cookie");
  }
  return `${STUDENT_ACCESS_COOKIE_PREFIX}${workspaceId}`;
}

/**
 * A short second factor the teacher can give to one student. It is derived
 * from the workspace id and the server secret, so it is never stored in the
 * database or exposed on the public join page.
 */
function studentPinSecret(): string {
  const appSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!appSecret) {
    throw new Error("AUTH_SECRET is required to derive student join PINs");
  }
  return appSecret;
}

/**
 * Generates a deterministic one-to-one PIN assignment for a whole session.
 * Collision resolution is deterministic, so every workspace in the same
 * session is guaranteed to have a different PIN.
 */
export function deriveWorkspaceJoinPins(
  workspaceIds: readonly string[],
): Map<string, string> {
  const uniqueIds = [...new Set(workspaceIds)].sort();
  if (uniqueIds.length !== workspaceIds.length) {
    throw new Error("Workspace ids for PIN derivation must be unique");
  }
  if (uniqueIds.length > 10_000) {
    throw new Error("Too many workspaces for four-digit PINs");
  }

  const appSecret = studentPinSecret();
  const used = new Set<number>();
  const pins = new Map<string, string>();

  for (const workspaceId of uniqueIds) {
    const digest = createHmac("sha256", appSecret)
      .update(`parta:workspace-pin:${workspaceId}`, "utf8")
      .digest();
    const basePin = digest.readUInt32BE(0) % 10_000;
    let attempt = 0;
    while (attempt < 10_000) {
      const numericPin = (basePin + attempt) % 10_000;
      if (!used.has(numericPin)) {
        used.add(numericPin);
        pins.set(workspaceId, String(numericPin).padStart(4, "0"));
        break;
      }
      attempt += 1;
    }
  }

  if (pins.size !== uniqueIds.length) {
    throw new Error("Could not allocate unique student PINs");
  }
  return pins;
}

export function deriveWorkspaceJoinPin(
  workspaceId: string,
  sessionWorkspaceIds: readonly string[],
): string {
  const pin = deriveWorkspaceJoinPins(sessionWorkspaceIds).get(workspaceId);
  if (!pin) throw new Error("Workspace is not part of this session");
  return pin;
}

export function verifyWorkspaceJoinPin(
  workspaceId: string,
  candidate: string,
  sessionWorkspaceIds: readonly string[],
): boolean {
  if (!/^\d{4}$/.test(candidate)) return false;
  const expected = deriveWorkspaceJoinPin(workspaceId, sessionWorkspaceIds);
  return timingSafeEqual(
    Buffer.from(candidate, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

export function parseStudentAccessCookie(
  value: string | undefined,
): { workspaceId: string; secret: string } | null {
  if (!value) return null;

  const separator = value.indexOf(".");
  if (separator < 1 || separator === value.length - 1) return null;

  const workspaceId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId) ||
    !/^[A-Za-z0-9_-]{32,}$/.test(secret)
  ) {
    return null;
  }

  return { workspaceId, secret };
}

function equalHash(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function verifyStudentAccessCookie(
  value: string | undefined,
  workspace: Pick<
    WorkspaceAccessTarget,
    "id" | "studentAccessHash" | "studentAccessExpiresAt"
  >,
  now: Date = new Date(),
): boolean {
  const parsed = parseStudentAccessCookie(value);
  if (
    !parsed ||
    parsed.workspaceId !== workspace.id ||
    !workspace.studentAccessHash ||
    !workspace.studentAccessExpiresAt ||
    workspace.studentAccessExpiresAt.getTime() <= now.getTime()
  ) {
    return false;
  }

  return equalHash(
    hashStudentAccessSecret(parsed.secret),
    workspace.studentAccessHash,
  );
}

/**
 * Teacher auth is checked first, so an open teacher session never gets
 * accidentally downgraded to a student just because the browser has a cookie.
 */
export async function authorizeWorkspaceRequest(
  req: NextRequest,
  workspace: WorkspaceAccessTarget,
): Promise<WorkspaceViewer | null> {
  const teacherSession = await auth();
  const teacherId = teacherSession?.user?.id;
  if (teacherId && teacherId === workspace.session.teacherId) {
    return { role: "teacher", teacherId };
  }

  const cookie = req.cookies.get(studentAccessCookieName(workspace.id))?.value;
  if (verifyStudentAccessCookie(cookie, workspace)) {
    return { role: "student", workspaceId: workspace.id };
  }

  return null;
}

/**
 * Resolves the workspace encoded in the HttpOnly cookie. Useful for endpoints
 * addressed by session/template rather than by workspace id.
 */
export async function resolveStudentWorkspaces(req: NextRequest) {
  const candidates = req.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith(STUDENT_ACCESS_COOKIE_PREFIX))
    .slice(0, MAX_STUDENT_COOKIES)
    .flatMap((cookie) => {
      const parsed = parseStudentAccessCookie(cookie.value);
      if (
        !parsed ||
        cookie.name !== studentAccessCookieName(parsed.workspaceId)
      ) {
        return [];
      }
      return [{ value: cookie.value, parsed }];
    });
  if (candidates.length === 0) return [];

  const workspaceIds = [...new Set(candidates.map((c) => c.parsed.workspaceId))];
  const workspaces = await db.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: {
      id: true,
      sessionId: true,
      studentId: true,
      studentAccessHash: true,
      studentAccessExpiresAt: true,
      session: { select: { teacherId: true } },
    },
  });
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  return candidates.flatMap((candidate) => {
    const workspace = byId.get(candidate.parsed.workspaceId);
    if (
      !workspace ||
      !verifyStudentAccessCookie(candidate.value, workspace)
    ) {
      return [];
    }
    return [workspace];
  });
}

export async function resolveStudentWorkspace(req: NextRequest) {
  return (await resolveStudentWorkspaces(req))[0] ?? null;
}

export function setStudentAccessCookie(
  response: NextResponse,
  workspaceId: string,
  secret: string,
  expires: Date,
): void {
  response.cookies.set({
    name: studentAccessCookieName(workspaceId),
    value: makeStudentAccessCookieValue(workspaceId, secret),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export function clearStudentAccessCookie(
  response: NextResponse,
  workspaceId: string,
): void {
  response.cookies.set({
    name: studentAccessCookieName(workspaceId),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}
