import { describe, expect, test } from 'bun:test'
import { pickNext, type Box } from './spatialNav'

const box = (left: number, top: number, width = 100, height = 150): Box => ({ left, top, right: left + width, bottom: top + height })

/** Two rows of posters 120 px apart sideways, rows 200 px apart; the second row scrolled a little. */
const rowA = [0, 120, 240, 360, 480].map((x) => box(x, 0))
const rowB = [30, 150, 270, 390, 510].map((x) => box(x, 200))
const all = [...rowA, ...rowB]

describe('pickNext', () => {
  test('moves along a row', () => {
    expect(pickNext(rowA[1], all, 'right')).toBe(2)
    expect(pickNext(rowA[1], all, 'left')).toBe(0)
  })

  test('stays put at the end of a row instead of jumping into another', () => {
    expect(pickNext(rowA[4], all, 'right')).toBe(-1)
    expect(pickNext(rowA[0], all, 'left')).toBe(-1)
  })

  test('goes down to the card under the focus', () => {
    expect(pickNext(rowA[2], all, 'down')).toBe(5 + 2)
    expect(pickNext(rowB[3], all, 'up')).toBe(3)
  })

  test('prefers the next row over a closer-aligned card further away', () => {
    const rowC = [box(240, 400)]
    const boxes = [...rowA, box(900, 200), ...rowC]
    // From the third card: the only card in the next row is far to the side, but it's the next row
    expect(pickNext(rowA[2], boxes, 'down')).toBe(5)
  })

  test('reaches a wide button above a row of cards', () => {
    const play = box(40, -120, 160, 48)
    const boxes = [play, ...rowA]
    expect(pickNext(rowA[3], boxes, 'up')).toBe(0)
  })

  test('nothing above the top row', () => {
    expect(pickNext(rowA[0], all, 'up')).toBe(-1)
  })

  test('buttons of different heights on one line count as a row', () => {
    const back = box(0, 0, 40, 40)
    const pill = box(60, 4, 160, 32)
    expect(pickNext(back, [back, pill], 'right')).toBe(1)
  })
})
