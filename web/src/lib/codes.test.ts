import { describe, expect, it } from "vitest";
import { generateJoinCode, generateAnonToken, generateQrToken } from "./codes";

describe("generateJoinCode", () => {
  it("длина ровно 6", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateJoinCode()).toHaveLength(6);
    }
  });

  it("использует только цифры 2-9 (чтобы не путать 0/O и 1/I при диктовке)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      expect(code).toMatch(/^[2-9]{6}$/);
    }
  });

  it("каждый вызов разный (вероятность коллизии в 50 ≈ 0)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generateJoinCode());
    expect(codes.size).toBeGreaterThan(40); // запас на случайную коллизию
  });
});

describe("generateAnonToken", () => {
  it("длина 32 символа hex", () => {
    for (let i = 0; i < 20; i++) {
      const t = generateAnonToken();
      expect(t).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("уникален", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateAnonToken());
    expect(set.size).toBe(100);
  });
});

describe("generateQrToken", () => {
  it("выдаёт строку нормальной длины", () => {
    expect(generateQrToken().length).toBeGreaterThan(16);
  });
});
