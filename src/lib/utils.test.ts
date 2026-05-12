import { describe, it, expect } from 'bun:test';
import { slugify } from './utils';

describe('slugify', () => {
  it('should return an empty string for falsy inputs', () => {
    expect(slugify('')).toBe('');
    // The current implementation takes a string, but let's test if it handles undefined/null if casted
    expect(slugify(undefined as unknown as string)).toBe('');
    expect(slugify(null as unknown as string)).toBe('');
  });

  it('should lowercase strings and replace spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('The Matrix')).toBe('the-matrix');
  });

  it('should handle strings with multiple spaces', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
    expect(slugify('  The   Matrix  ')).toBe('the-matrix');
  });

  it('should remove special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('This & That')).toBe('this-that');
    expect(slugify('100% Pure')).toBe('100-pure');
  });

  it('should replace multiple hyphens with a single hyphen', () => {
    expect(slugify('hello---world')).toBe('hello-world');
    expect(slugify('the--matrix')).toBe('the-matrix');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(slugify('-hello-world-')).toBe('hello-world');
    expect(slugify('---the-matrix---')).toBe('the-matrix');
    expect(slugify(' - spacing before and after - ')).toBe('spacing-before-and-after');
  });

  it('should handle complex combinations', () => {
    expect(slugify('  Hello, World!!!  -- This is a test  ')).toBe('hello-world-this-is-a-test');
    expect(slugify('!@#$%^&*()_+={}|[]\\:";\'<>?,./')).toBe('_');
  });
});
