import { describe, expect, it } from "vitest";
import { isSignupSource, signupSourceFromParams } from "@snippo/shared";

const params = (query: string) => new URLSearchParams(query);

describe("signupSourceFromParams", () => {
  it("joins source, medium and campaign", () => {
    expect(signupSourceFromParams(params("utm_source=instagram&utm_medium=paid&utm_campaign=ristoranti-test"))).toBe("instagram / paid / ristoranti-test");
  });

  it("needs a source and keeps the parts that are given", () => {
    expect(signupSourceFromParams(params(""))).toBeUndefined();
    expect(signupSourceFromParams(params("utm_medium=paid&utm_campaign=x"))).toBeUndefined();
    expect(signupSourceFromParams(params("utm_source=google"))).toBe("google");
    expect(signupSourceFromParams(params("utm_source=google&utm_campaign=autunno_2026"))).toBe("google / autunno_2026");
  });

  it("drops invalid parts and trims spaces", () => {
    expect(signupSourceFromParams(params("utm_source=%3Cscript%3E&utm_medium=paid"))).toBeUndefined();
    expect(signupSourceFromParams(params(`utm_source=newsletter&utm_medium=${"a".repeat(51)}&utm_campaign=v1.2`))).toBe("newsletter / v1.2");
    expect(signupSourceFromParams(params("utm_source=%20meta%20&utm_medium=amico%20di%20Mario"))).toBe("meta");
  });

  it("produces only values isSignupSource accepts", () => {
    for (const query of ["utm_source=a", "utm_source=a&utm_medium=b", "utm_source=a&utm_medium=b&utm_campaign=c"]) {
      expect(isSignupSource(signupSourceFromParams(params(query)))).toBe(true);
    }
  });
});

describe("isSignupSource", () => {
  it("accepts one to three short codes separated by ' / '", () => {
    for (const value of ["instagram", "instagram / paid", "instagram / paid / ristoranti-test", "a".repeat(50)]) {
      expect(isSignupSource(value)).toBe(true);
    }
  });

  it("refuses anything else", () => {
    const invalid = ["", "<script>", "a".repeat(51), "a".repeat(300), "a / b / c / d", "a/b", "a  / b", "amico di Mario", "a / ", 42, null, undefined];
    for (const value of invalid) expect(isSignupSource(value)).toBe(false);
  });
});
