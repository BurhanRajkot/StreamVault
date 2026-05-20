import { describe, it, expect } from 'bun:test'
import { rrfFuse, RankedList } from './rrfFusion'

describe('Reciprocal Rank Fusion (RRF)', () => {
  it('should compute scores and rank items correctly from single list', () => {
    const list1: RankedList<{id: number}> = {
      label: 'list1',
      items: [{id: 1}, {id: 2}, {id: 3}]
    }

    const results = rrfFuse([list1], 60)
    
    expect(results.length).toBe(3)
    // First item should have highest score
    expect(results[0].item.id).toBe(1)
    expect(results[0].rrfScore).toBeGreaterThan(results[1].rrfScore)
    expect(results[1].item.id).toBe(2)
  })

  it('should fuse multiple lists and boost overlapping items', () => {
    const list1: RankedList<{id: number}> = {
      label: 'list1',
      items: [{id: 1}, {id: 2}, {id: 3}]
    }
    const list2: RankedList<{id: number}> = {
      label: 'list2',
      items: [{id: 3}, {id: 4}, {id: 1}]
    }

    const results = rrfFuse([list1, list2], 60)
    
    expect(results.length).toBe(4) // 1, 2, 3, 4
    
    const item1 = results.find(r => r.item.id === 1)
    const item2 = results.find(r => r.item.id === 2)
    const item3 = results.find(r => r.item.id === 3)
    const item4 = results.find(r => r.item.id === 4)

    expect(item1).toBeDefined()
    expect(item3).toBeDefined()

    // Item 1 is rank 1 in list1 and rank 3 in list2
    // Item 3 is rank 3 in list1 and rank 1 in list2
    // They should have the exact same score since (1/61 + 1/63) == (1/63 + 1/61)
    expect(item1!.rrfScore).toBeCloseTo(item3!.rrfScore)

    // Item 2 is only in list1
    // Item 4 is only in list2
    // Their score should be lower than items 1 and 3 because of absence penalty
    expect(item1!.rrfScore).toBeGreaterThan(item2!.rrfScore)
    expect(item1!.rrfScore).toBeGreaterThan(item4!.rrfScore)
  })
})
