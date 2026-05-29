import { describe, expect, test } from "bun:test";
import { normalizeText, jaroWinkler, levenshteinDistance } from "./searchAlgorithm";

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

describe("searchAlgorithm - levenshteinDistance", () => {
  test("should handle empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("a", "")).toBe(1);
    expect(levenshteinDistance("", "a")).toBe(1);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  test("should handle identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("abc", "abc")).toBe(0);
  });

  test("should handle single character edits (substitutions)", () => {
    expect(levenshteinDistance("kitten", "sitten")).toBe(1);
    expect(levenshteinDistance("flaw", "flan")).toBe(1);
  });

  test("should handle insertions/deletions", () => {
    expect(levenshteinDistance("sittin", "sitting")).toBe(1);
    expect(levenshteinDistance("sitting", "sittin")).toBe(1);
    expect(levenshteinDistance("cat", "cart")).toBe(1);
  });

  test("should be case-sensitive", () => {
    expect(levenshteinDistance("git", "Git")).toBe(1);
    expect(levenshteinDistance("HELLO", "hello")).toBe(5);
  });

  test("should handle completely different strings", () => {
    expect(levenshteinDistance("rosettacode", "raisethysword")).toBe(8);
    expect(levenshteinDistance("abc", "def")).toBe(3);
  });

  test("should handle very long vs short inputs", () => {
    const longString = "a".repeat(100);
    expect(levenshteinDistance(longString, "a")).toBe(99);
    expect(levenshteinDistance("a", longString)).toBe(99);
  });
});