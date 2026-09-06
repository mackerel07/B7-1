import { describe, expect, it } from "vitest";
import { validateEmail, validatePassword } from "../lib/authValidation";
import { validateQuestion } from "../lib/api";

describe("authValidation", () => {
  it("rejects empty and invalid emails", () => {
    expect(validateEmail("")).toBeTruthy();
    expect(validateEmail("not-an-email")).toBeTruthy();
    expect(validateEmail("user@example.com")).toBeNull();
  });

  it("enforces password minimum length", () => {
    expect(validatePassword("123")).toBeTruthy();
    expect(validatePassword("123456")).toBeNull();
  });
});

describe("validateQuestion", () => {
  it("rejects blank and oversized questions", () => {
    expect(validateQuestion("   ")).toBeTruthy();
    expect(validateQuestion("a".repeat(2001))).toBeTruthy();
    expect(validateQuestion("안녕하세요")).toBeNull();
  });
});
