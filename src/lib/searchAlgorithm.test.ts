import { describe, expect, test } from "bun:test";
import { normalizeText, levenshteinDistance } from "./searchAlgorithm";

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
