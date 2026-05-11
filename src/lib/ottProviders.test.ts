import { describe, expect, test } from "bun:test";
import { getProviderById, getAllProviderIds, OTT_PROVIDERS } from "./ottProviders";

describe("ottProviders - getProviderById", () => {
  test("should return the correct provider when given a valid ID", () => {
    const provider = getProviderById('8');
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('Netflix');
    expect(provider?.id).toBe('8');
  });

  test("should return undefined when given an invalid ID", () => {
    const provider = getProviderById('invalid-id');
    expect(provider).toBeUndefined();
  });

  test("should return undefined when given an empty string", () => {
    const provider = getProviderById('');
    expect(provider).toBeUndefined();
  });
});

describe("ottProviders - getAllProviderIds", () => {
  test("should return a comma-separated string of all provider IDs", () => {
    const expectedIds = OTT_PROVIDERS.map(p => p.id).join(',');
    expect(getAllProviderIds()).toBe(expectedIds);
    // Also explicitly check it contains the known IDs
    expect(getAllProviderIds()).toContain('8');
    expect(getAllProviderIds()).toContain('119');
    expect(getAllProviderIds()).toContain('1899');
    expect(getAllProviderIds()).toContain('350');
  });
});
