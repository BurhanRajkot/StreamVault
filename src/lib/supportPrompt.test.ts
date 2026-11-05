import { describe, expect, test } from 'bun:test'
import { isSupportPromptPlay } from './supportPrompt'

describe('isSupportPromptPlay', () => {
  test('prompts on plays 5, 15, 35, 45, then every 15', () => {
    const prompted = Array.from({ length: 120 }, (_, i) => i + 1).filter(isSupportPromptPlay)
    expect(prompted).toEqual([5, 15, 35, 45, 60, 75, 90, 105, 120])
  })

  test('ignores counts that are not plays', () => {
    expect(isSupportPromptPlay(0)).toBe(false)
    expect(isSupportPromptPlay(-5)).toBe(false)
    expect(isSupportPromptPlay(5.5)).toBe(false)
  })
})
