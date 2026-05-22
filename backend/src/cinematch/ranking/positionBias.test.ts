import { describe, it, expect, mock, beforeAll } from 'bun:test'

// mock.module must be called before any dynamic import that triggers supabase.ts.
// Using a static import would hoist past this call and fail.
mock.module('../../lib/supabase', () => ({
  supabaseAdmin: {}
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ipsCorrectWeight: any

beforeAll(async () => {
  const mod = await import('./positionBias')
  ipsCorrectWeight = mod.ipsCorrectWeight
})

type PropensityTable = Map<number, number>

describe('Position Bias / IPS', () => {
  it('should compute IPS corrected weights properly', () => {
    const propensityTable: PropensityTable = new Map([
      [0, 1.0],   // Top slot, 100% propensity
      [1, 0.8],   // Slot 1
      [2, 0.5],   // Slot 2
      [9, 0.1],   // Deep slot
    ])

    const rawWeight = 0.2

    const weight0 = ipsCorrectWeight(rawWeight, 0, propensityTable)
    const weight1 = ipsCorrectWeight(rawWeight, 1, propensityTable)
    const weight9 = ipsCorrectWeight(rawWeight, 9, propensityTable)

    // weight / 1.0 = rawWeight
    expect(weight0).toBe(0.2)
    // weight / 0.8 = 0.25
    expect(weight1).toBeCloseTo(0.25)
    // weight / 0.1 = 2.0
    expect(weight9).toBeCloseTo(2.0)
    
    // Lower propensity means HIGHER corrected weight, because it was harder to find
    expect(weight9).toBeGreaterThan(weight1)
    expect(weight1).toBeGreaterThan(weight0)
  })

  it('should apply fallback propensity for unknown slots', () => {
    const propensityTable: PropensityTable = new Map()
    const rawWeight = 0.2

    const weight = ipsCorrectWeight(rawWeight, 99, propensityTable)
    
    // Fallback propensity is 0.1, so weight / 0.1 = 2.0
    expect(weight).toBeCloseTo(2.0)
  })

  it('should cap extreme IPS weights using MAX_IPS_WEIGHT', () => {
    // Let's assume a really low propensity
    const propensityTable: PropensityTable = new Map([
      [50, 0.001],
    ])
    
    const rawWeight = 1.0
    // Uncapped would be 1000.0, but MAX_IPS_WEIGHT is 10.0
    const weight = ipsCorrectWeight(rawWeight, 50, propensityTable)
    
    expect(weight).toBe(10.0)
  })
})
