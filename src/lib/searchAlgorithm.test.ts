import { test, expect, describe } from 'bun:test';
import { bayesianAverage } from './searchAlgorithm';

describe('bayesianAverage', () => {
  test('calculates standard bayesian average correctly', () => {
    // v: 100, m: 50, R: 8.0, C: 6.5
    // (100 / 150) * 8.0 + (50 / 150) * 6.5
    // 0.666... * 8.0 + 0.333... * 6.5
    // 5.333... + 2.166... = 7.5
    expect(bayesianAverage(100, 50, 8.0, 6.5)).toBeCloseTo(7.5);
  });

  test('returns exactly the mean rating (C) when there are zero votes (v = 0)', () => {
    // v: 0, m: 50, R: 8.0, C: 6.5
    // (0 / 50) * 8.0 + (50 / 50) * 6.5 = 6.5
    expect(bayesianAverage(0, 50, 8.0, 6.5)).toBe(6.5);
  });

  test('returns exactly the movie rating (R) when minimum votes threshold is zero (m = 0)', () => {
    // v: 100, m: 0, R: 8.0, C: 6.5
    // (100 / 100) * 8.0 + (0 / 100) * 6.5 = 8.0
    expect(bayesianAverage(100, 0, 8.0, 6.5)).toBe(8.0);
  });

  test('handles R = 0 correctly', () => {
    // v: 50, m: 50, R: 0, C: 6.5
    // (50 / 100) * 0 + (50 / 100) * 6.5 = 3.25
    expect(bayesianAverage(50, 50, 0, 6.5)).toBe(3.25);
  });

  test('handles C = 0 correctly', () => {
    // v: 50, m: 50, R: 8.0, C: 0
    // (50 / 100) * 8.0 + (50 / 100) * 0 = 4.0
    expect(bayesianAverage(50, 50, 8.0, 0)).toBe(4.0);
  });

  test('returns NaN when both v and m are zero (division by zero)', () => {
    // v: 0, m: 0, R: 8.0, C: 6.5
    // (0 / 0) * 8.0 + (0 / 0) * 6.5 = NaN
    expect(bayesianAverage(0, 0, 8.0, 6.5)).toBeNaN();
  });
});
