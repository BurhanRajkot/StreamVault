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
  test("should return 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  test("should handle empty strings", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
  });

  test("should calculate distance for insertions", () => {
    expect(levenshteinDistance("git", "github")).toBe(3);
    expect(levenshteinDistance("test", "testing")).toBe(3);
  });

  test("should calculate distance for deletions", () => {
    expect(levenshteinDistance("github", "git")).toBe(3);
    expect(levenshteinDistance("testing", "test")).toBe(3);
  });

  test("should calculate distance for substitutions", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3); // k->s, e->i, +g
    expect(levenshteinDistance("flaw", "lawn")).toBe(2); // f->l, a->a, w->w, +n -> flaw->lawn
  });

  test("should be case sensitive", () => {
    expect(levenshteinDistance("git", "Git")).toBe(1);
    expect(levenshteinDistance("Hello", "hello")).toBe(1);
  });

  test("should handle completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
    expect(levenshteinDistance("short", "muchlonger")).toBe(8);
  });
});
