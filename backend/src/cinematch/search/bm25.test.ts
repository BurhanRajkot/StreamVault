import { test, expect, describe } from 'bun:test';
import { tokenize } from './bm25';

describe('BM25 Tokenizer', () => {
  test('should tokenize a basic sentence into lowercase words', () => {
    const result = tokenize('Hello World');
    expect(result).toEqual(['hello', 'world']);
  });

  test('should remove special characters and punctuation', () => {
    const result = tokenize('Hello, World! Welcome to 2024.');
    expect(result).toEqual(['hello', 'world', 'welcome', '2024']);
  });

  test('should filter out stopwords', () => {
    // STOPWORDS includes 'the', 'is', 'a', 'to', 'for', etc.
    const result = tokenize('The matrix is a movie for everyone');
    expect(result).toEqual(['matrix', 'movie', 'everyone']);
  });

  test('should filter out single-character words', () => {
    // Even if not a stopword, length must be > 1
    const result = tokenize('X marks the spot O');
    expect(result).toEqual(['marks', 'spot']);
  });

  test('should handle empty strings and whitespace-only strings', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('\t\n')).toEqual([]);
  });

  test('should handle strings with only stopwords and special characters', () => {
    expect(tokenize('the, and, of!')).toEqual([]);
  });

  test('should split by multiple consecutive whitespace characters', () => {
    const result = tokenize('hello   \t\n  world');
    expect(result).toEqual(['hello', 'world']);
  });

  test('should preserve alphanumeric characters properly', () => {
    const result = tokenize('Star Wars: Episode IV - A New Hope');
    expect(result).toEqual(['star', 'wars', 'episode', 'iv', 'new', 'hope']);
  });
});
