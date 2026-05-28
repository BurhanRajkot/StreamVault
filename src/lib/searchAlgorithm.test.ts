import { describe, expect, test } from "bun:test";
import { normalizeText, jaroWinkler } from "./searchAlgorithm";

describe("searchAlgorithm - jaroWinkler", () => {
  test("should return 1.0 for exact matches", () => {
    expect(jaroWinkler("hello", "hello")).toBe(1.0);
    expect(jaroWinkler("test", "test")).toBe(1.0);
  });

  test("should return 0.0 for one or both empty strings", () => {
    expect(jaroWinkler("", "")).toBe(1.0); // handled by `if (s1 === s2) return 1.0`
    expect(jaroWinkler("hello", "")).toBe(0.0);
    expect(jaroWinkler("", "world")).toBe(0.0);
  });

  test("should return 0.0 for completely different strings", () => {
    expect(jaroWinkler("abc", "xyz")).toBe(0.0);
    expect(jaroWinkler("cat", "dog")).toBe(0.0);
  });

  test("should return score between 0 and 1 for partial matches", () => {
    const score = jaroWinkler("dixon", "dicksonx");
    expect(score).toBeGreaterThan(0.0);
    expect(score).toBeLessThan(1.0);
    // Typical jaro winkler for these two should be around 0.813
    expect(score).toBeCloseTo(0.813, 3);
  });

  test("should give higher score to strings sharing a prefix (Winkler modification)", () => {
    // Both pairs have similar Jaro distance, but pair1 shares a prefix
    const pair1Score = jaroWinkler("martha", "marhta");
    const pair2Score = jaroWinkler("dwayne", "duane");

    expect(pair1Score).toBeGreaterThan(0.0);
    expect(pair2Score).toBeGreaterThan(0.0);
    expect(pair1Score).toBeCloseTo(0.961, 3); // martha/marhta is famous example
    expect(pair2Score).toBeCloseTo(0.840, 3); // dwayne/duane is famous example
  });

  test("should handle case sensitivity correctly (it doesn't normalize by default)", () => {
    // jaroWinkler itself is case sensitive. Normalization happens outside.
    expect(jaroWinkler("Hello", "hello")).toBeLessThan(1.0);
  });
});

describe("searchAlgorithm - normalizeText", () => {
  test("should handle empty strings", () => {
    expect(normalizeText("")).toBe("");
  });

  test("should lowercase text", () => {
    expect(normalizeText("HELLO")).toBe("hello");
    expect(normalizeText("CamelCase")).toBe("camelcase");
  });

  test("should remove diacritics and accents", () => {
    expect(normalizeText("Amélie")).toBe("amelie");
    expect(normalizeText("café")).toBe("cafe");
    expect(normalizeText("niño")).toBe("nino");
    expect(normalizeText("façade")).toBe("facade");
    expect(normalizeText("über")).toBe("uber");
    expect(normalizeText("résumé")).toBe("resume");
  });

  test("should handle mixed casing with accents", () => {
    expect(normalizeText("ÀÉÎÕÜ")).toBe("aeiou");
  });

  test("should preserve numbers and symbols", () => {
    expect(normalizeText("Movie 123! @#$")).toBe("movie 123! @#$");
  });

  test("should handle whitespace correctly", () => {
    expect(normalizeText("  Hello World  ")).toBe("  hello world  ");
  });
});
