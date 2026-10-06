import { describe, expect, it } from "vitest";
import { loginSchema, onboardingSchema, signupSchema, slugify } from "./auth";

describe("auth validation", () => {
  it("normalizes e-mail", () => {
    expect(loginSchema.parse({ email: "  A@B.com ", password: "x" }).email).toBe("a@b.com");
  });
  it("rejects short passwords on signup", () => {
    expect(
      signupSchema.safeParse({ fullName: "Ana", email: "a@b.com", password: "123" }).success,
    ).toBe(false);
  });
  it("validates onboarding names", () => {
    expect(
      onboardingSchema.safeParse({ organizationName: "D", projectName: "ROI Club" }).success,
    ).toBe(false);
  });
  it("slugifies with accents", () => {
    expect(slugify("DS Vendas Ação")).toBe("ds-vendas-acao");
  });
});
