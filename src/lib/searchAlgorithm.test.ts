import { describe, expect, test } from "bun:test";
import { normalizeText, bayesianAverage } from "./searchAlgorithm";

describe("searchAlgorithm - bayesianAverage", () => {
  test("calculates standard bayesian average correctly", () => {
    // Expected: (100 / (100 + 50)) * 8.0 + (50 / (100 + 50)) * 6.5
    // = (100/150) * 8.0 + (50/150) * 6.5
    // = (2/3) * 8.0 + (1/3) * 6.5
    // = 5.333... + 2.166... = 7.5
    const result = bayesianAverage(100, 50, 8.0, 6.5);
    expect(result).toBeCloseTo(7.5);
  });

  test("handles zero votes (returns global mean C)", () => {
    const result = bayesianAverage(0, 50, 8.0, 6.5);
    // (0 / 50) * 8.0 + (50 / 50) * 6.5 = 6.5
    expect(result).toBe(6.5);
  });

  test("handles zero minimum required votes (m=0)", () => {
    const result = bayesianAverage(100, 0, 8.0, 6.5);
    // (100 / 100) * 8.0 + (0 / 100) * 6.5 = 8.0
    expect(result).toBe(8.0);
  });

  test("handles v + m === 0 to avoid division by zero (returns C)", () => {
    const result = bayesianAverage(0, 0, 8.0, 6.5);
    expect(result).toBe(6.5);
  });

  test("returns C when v and m sum to 0 even if values are negative", () => {
    const result = bayesianAverage(10, -10, 8.0, 6.5);
    expect(result).toBe(6.5);
  });

  test("calculates correctly with very large numbers", () => {
    const result = bayesianAverage(1000000, 500, 9.0, 6.5);
    // Extremely close to 9.0 because vote count vastly outweighs m
    expect(result).toBeCloseTo(9.0, 2);
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
