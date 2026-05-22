import { describe, it, expect } from 'bun:test'
import { rrfFuse, RankedList } from './rrfFusion'

describe('Reciprocal Rank Fusion (RRF) — Extended Tests', () => {
  it('should handle an empty lists array', () => {
    const results = rrfFuse([])
    expect(results).toEqual([])
  })

  it('should handle a list with a single item', () => {
    const list: RankedList<{ id: number }> = { label: 'solo', items: [{ id: 1 }] }
    const results = rrfFuse([list], 60)
    expect(results.length).toBe(1)
    expect(results[0].item.id).toBe(1)
    expect(results[0].rrfScore).toBeCloseTo(1 / (60 + 1))
  })

  it('should compute correct score for rank-1 item in k=60', () => {
    const list: RankedList<{ id: number }> = {
      label: 'list1',
      items: [{ id: 1 }, { id: 2 }],
    }
    const results = rrfFuse([list], 60)
    // rank 1 → 1/61, rank 2 → 1/62 + absence penalty from empty other lists = just this list
    expect(results[0].rrfScore).toBeCloseTo(1 / 61)
    expect(results[1].rrfScore).toBeCloseTo(1 / 62)
  })

  it('should boost items present in all 3 lists over items in only 1', () => {
    const listA: RankedList<{ id: number }> = { label: 'a', items: [{ id: 1 }, { id: 2 }] }
    const listB: RankedList<{ id: number }> = { label: 'b', items: [{ id: 1 }, { id: 3 }] }
    const listC: RankedList<{ id: number }> = { label: 'c', items: [{ id: 1 }, { id: 4 }] }

    const results = rrfFuse([listA, listB, listC], 60)
    const item1 = results.find(r => r.item.id === 1)!
    const item2 = results.find(r => r.item.id === 2)!
    const item3 = results.find(r => r.item.id === 3)!
    const item4 = results.find(r => r.item.id === 4)!

    // item1 is rank-1 in ALL three lists — should have highest score
    expect(item1.rrfScore).toBeGreaterThan(item2.rrfScore)
    expect(item1.rrfScore).toBeGreaterThan(item3.rrfScore)
    expect(item1.rrfScore).toBeGreaterThan(item4.rrfScore)
  })

  it('should include items from all lists in the merged output', () => {
    const listA: RankedList<{ id: number }> = { label: 'a', items: [{ id: 1 }, { id: 2 }] }
    const listB: RankedList<{ id: number }> = { label: 'b', items: [{ id: 3 }, { id: 4 }] }
    const results = rrfFuse([listA, listB], 60)
    expect(results.length).toBe(4)
    const ids = results.map(r => r.item.id)
    expect(ids).toContain(1)
    expect(ids).toContain(2)
    expect(ids).toContain(3)
    expect(ids).toContain(4)
  })

  it('should record contributions per list label', () => {
    const listA: RankedList<{ id: number }> = { label: 'bm25', items: [{ id: 1 }] }
    const listB: RankedList<{ id: number }> = { label: 'popularity', items: [{ id: 1 }, { id: 2 }] }
    const results = rrfFuse([listA, listB], 60)

    const item1 = results.find(r => r.item.id === 1)!
    expect(item1.contributions['bm25']).toBeDefined()
    expect(item1.contributions['popularity']).toBeDefined()
  })

  it('should apply worst-rank penalty — items in both lists outscore items in only one', () => {
    // item 1: rank-1 in listA AND rank-1 in listB (best possible — in both)
    // item 2: rank-2 in listA only
    // item 3: rank-2 in listB only
    const listA: RankedList<{ id: number }> = { label: 'a', items: [{ id: 1 }, { id: 2 }] }
    const listB: RankedList<{ id: number }> = { label: 'b', items: [{ id: 1 }, { id: 3 }] }
    const results = rrfFuse([listA, listB], 60)

    const item1 = results.find(r => r.item.id === 1)!
    const item2 = results.find(r => r.item.id === 2)!
    const item3 = results.find(r => r.item.id === 3)!

    // item1 appears in both lists at rank-1 — must have the highest combined score
    expect(item1.rrfScore).toBeGreaterThan(item2.rrfScore)
    expect(item1.rrfScore).toBeGreaterThan(item3.rrfScore)

    // All items have positive scores (absence penalty > 0)
    expect(item2.rrfScore).toBeGreaterThan(0)
    expect(item3.rrfScore).toBeGreaterThan(0)
  })

  it('should produce deterministic results (same output for same input)', () => {
    const listA: RankedList<{ id: number }> = { label: 'a', items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    const listB: RankedList<{ id: number }> = { label: 'b', items: [{ id: 3 }, { id: 1 }, { id: 2 }] }
    const r1 = rrfFuse([listA, listB], 60)
    const r2 = rrfFuse([listA, listB], 60)
    expect(r1.map(r => r.item.id)).toEqual(r2.map(r => r.item.id))
    expect(r1.map(r => r.rrfScore)).toEqual(r2.map(r => r.rrfScore))
  })

  it('should handle k=0 without dividing by zero', () => {
    const list: RankedList<{ id: number }> = { label: 'test', items: [{ id: 1 }, { id: 2 }] }
    expect(() => rrfFuse([list], 0)).not.toThrow()
    const results = rrfFuse([list], 0)
    expect(isNaN(results[0].rrfScore)).toBe(false)
  })

  it('should sort final results descending by rrfScore', () => {
    const listA: RankedList<{ id: number }> = { label: 'a', items: [{ id: 1 }, { id: 2 }, { id: 3 }] }
    const listB: RankedList<{ id: number }> = { label: 'b', items: [{ id: 2 }, { id: 1 }, { id: 3 }] }
    const results = rrfFuse([listA, listB])
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].rrfScore).toBeGreaterThanOrEqual(results[i + 1].rrfScore)
    }
  })
})
