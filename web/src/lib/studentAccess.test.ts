import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import {
  deriveWorkspaceJoinPin,
  deriveWorkspaceJoinPins,
  generateStudentAccessSecret,
  hashStudentAccessSecret,
  makeStudentAccessCookieValue,
  parseStudentAccessCookie,
  studentAccessCookieName,
  verifyStudentAccessCookie,
  verifyWorkspaceJoinPin,
} from "./studentAccess";

beforeAll(() => {
  vi.stubEnv("AUTH_SECRET", "student-access-unit-test-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function workspaceAccess(
  id: string,
  secret: string,
  expiresAt = new Date(Date.now() + 60_000),
) {
  return {
    id,
    studentAccessHash: hashStudentAccessSecret(secret),
    studentAccessExpiresAt: expiresAt,
  };
}

describe("workspace-scoped student access", () => {
  it("создаёт URL/cookie-safe секрет достаточной энтропии", () => {
    const first = generateStudentAccessSecret();
    const second = generateStudentAccessSecret();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("cookie содержит workspace id и секрет, а БД — только SHA-256", () => {
    const secret = generateStudentAccessSecret();
    const value = makeStudentAccessCookieValue("workspace-1", secret);
    const hash = hashStudentAccessSecret(secret);

    expect(parseStudentAccessCookie(value)).toEqual({
      workspaceId: "workspace-1",
      secret,
    });
    expect(studentAccessCookieName("workspace-1")).toBe(
      "parta_student_access_workspace-1",
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
    expect(verifyStudentAccessCookie(value, workspaceAccess("workspace-1", secret))).toBe(true);
  });

  it("отвергает подменённый секрет", () => {
    const secret = generateStudentAccessSecret();
    const value = makeStudentAccessCookieValue(
      "workspace-1",
      generateStudentAccessSecret(),
    );

    expect(verifyStudentAccessCookie(value, workspaceAccess("workspace-1", secret))).toBe(false);
  });

  it("не переносит доступ на другой workspace", () => {
    const secret = generateStudentAccessSecret();
    const value = makeStudentAccessCookieValue("workspace-1", secret);

    expect(verifyStudentAccessCookie(value, workspaceAccess("workspace-2", secret))).toBe(false);
  });

  it("отвергает истёкший доступ", () => {
    const secret = generateStudentAccessSecret();
    const value = makeStudentAccessCookieValue("workspace-1", secret);
    const now = new Date("2026-07-28T12:00:00.000Z");
    const expired = new Date("2026-07-28T11:59:59.999Z");

    expect(
      verifyStudentAccessCookie(
        value,
        workspaceAccess("workspace-1", secret, expired),
        now,
      ),
    ).toBe(false);
  });

  it("не разбирает повреждённые cookie", () => {
    expect(parseStudentAccessCookie(undefined)).toBeNull();
    expect(parseStudentAccessCookie("workspace-only")).toBeNull();
    expect(parseStudentAccessCookie("workspace.short")).toBeNull();
  });

  it("выводит стабильный четырёхзначный PIN без хранения в БД", () => {
    const workspaceIds = ["workspace-1", "workspace-2"];
    const pin = deriveWorkspaceJoinPin("workspace-1", workspaceIds);

    expect(pin).toMatch(/^\d{4}$/);
    expect(deriveWorkspaceJoinPin("workspace-1", workspaceIds)).toBe(pin);
    expect(verifyWorkspaceJoinPin("workspace-1", pin, workspaceIds)).toBe(true);
    expect(
      verifyWorkspaceJoinPin(
        "workspace-1",
        pin === "9999" ? "0000" : "9999",
        workspaceIds,
      ),
    ).toBe(false);
  });

  it("гарантирует уникальный PIN каждому workspace одной сессии", () => {
    const workspaceIds = Array.from(
      { length: 500 },
      (_, index) => `workspace-${index}`,
    );
    const pins = [...deriveWorkspaceJoinPins(workspaceIds).values()];

    expect(pins).toHaveLength(workspaceIds.length);
    expect(new Set(pins).size).toBe(workspaceIds.length);
    expect(pins.every((pin) => /^\d{4}$/.test(pin))).toBe(true);
  });
});
