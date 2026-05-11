import { describe, expect, test } from "bun:test";
import { cn, slugify } from "./utils";

describe("utils - cn", () => {
  test("should merge class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("should handle conditional classes", () => {
    const isB = true;
    const isC = false;
    expect(cn("a", isB && "b", isC && "c")).toBe("a b");
  });

  test("should handle object classes", () => {
    expect(cn({ a: true, b: false, c: true })).toBe("a c");
  });

  test("should handle array classes", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  test("should handle falsy values", () => {
    expect(cn("a", null, undefined, false, "")).toBe("a");
  });

  test("should merge tailwind classes correctly", () => {
    // twMerge behavior: p-4 should override px-2 and py-2
    expect(cn("px-2 py-2", "p-4")).toBe("p-4");
    // text-red-500 should override text-blue-500
    expect(cn("text-blue-500", "text-red-500")).toBe("text-red-500");
  });
});

describe("utils - slugify", () => {
  test("should convert to lowercase", () => {
    expect(slugify("HELLO")).toBe("hello");
  });

  test("should replace spaces with hyphens", () => {
    expect(slugify("hello world")).toBe("hello-world");
  });

  test("should remove special characters", () => {
    expect(slugify("hello world!")).toBe("hello-world");
    expect(slugify("movie: the sequel")).toBe("movie-the-sequel");
  });

  test("should handle multiple spaces and hyphens", () => {
    expect(slugify("hello   world")).toBe("hello-world");
    expect(slugify("hello---world")).toBe("hello-world");
  });

  test("should trim hyphens from start and end", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
    expect(slugify("-hello world-")).toBe("hello-world");
  });

  test("should return empty string for null/undefined/empty input", () => {
    expect(slugify("")).toBe("");
    // @ts-expect-error
    expect(slugify(null as unknown as string)).toBe("");
    // @ts-expect-error
    expect(slugify(undefined as unknown as string)).toBe("");
  });

  test("should handle complex strings", () => {
    expect(slugify("The Lord of the Rings: The Fellowship of the Ring (2001)"))
      .toBe("the-lord-of-the-rings-the-fellowship-of-the-ring-2001");
  });
});
