import { describe, expect, it } from 'bun:test'
import { FailureBudget } from './loginThrottle'

const MINUTE = 60_000

describe('FailureBudget', () => {
  it('accepts attempts until the limit of failures is reached, whoever made them', () => {
    const budget = new FailureBudget(3, 15 * MINUTE)
    const t0 = 1_000_000
    expect(budget.exhausted(t0)).toBe(false)
    budget.recordFailure(t0)
    budget.recordFailure(t0 + 1)
    expect(budget.exhausted(t0 + 2)).toBe(false)
    budget.recordFailure(t0 + 2)
    expect(budget.exhausted(t0 + 3)).toBe(true)
  })

  it('opens again as old failures leave the window', () => {
    const budget = new FailureBudget(2, 15 * MINUTE)
    const t0 = 1_000_000
    budget.recordFailure(t0)
    budget.recordFailure(t0 + 5 * MINUTE)
    expect(budget.exhausted(t0 + 14 * MINUTE)).toBe(true)
    // The first failure is 15 minutes old now; one slot is free again
    expect(budget.exhausted(t0 + 15 * MINUTE)).toBe(false)
    budget.recordFailure(t0 + 15 * MINUTE)
    expect(budget.exhausted(t0 + 16 * MINUTE)).toBe(true)
  })

  it('says how long until the next attempt is accepted', () => {
    const budget = new FailureBudget(2, 15 * MINUTE)
    const t0 = 1_000_000
    expect(budget.retryAfterSeconds(t0)).toBe(0)
    budget.recordFailure(t0)
    budget.recordFailure(t0 + MINUTE)
    expect(budget.retryAfterSeconds(t0 + 2 * MINUTE)).toBe(13 * 60)
    expect(budget.retryAfterSeconds(t0 + 15 * MINUTE)).toBe(0)
  })

  it('keeps a flood of failures from extending the lockout forever', () => {
    const budget = new FailureBudget(2, 15 * MINUTE)
    const t0 = 1_000_000
    // Refused attempts aren't recorded by the route, so only these two count
    budget.recordFailure(t0)
    budget.recordFailure(t0)
    expect(budget.exhausted(t0 + 15 * MINUTE - 1)).toBe(true)
    expect(budget.exhausted(t0 + 15 * MINUTE)).toBe(false)
  })
})
