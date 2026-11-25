/**
 * Which element a TV remote's arrow key moves to — geometry only, so it can
 * be tested without a page (spatialNav.test.ts). tvRemote.ts feeds it the
 * focusable elements' boxes.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Rows of cards sit close together; anything this near in the arrow's direction counts as the same "line". */
const LINE_SLACK_PX = 24

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart)
}

/**
 * The best box to move to from `from`, or -1 when there's nothing that way.
 *
 * Left/right stay on the same row: only boxes that share some height with
 * the current one count, nearest first — at a row's end the focus stays put
 * rather than jumping diagonally into another row.
 *
 * Up/down go to the nearest line of boxes in that direction (a row of cards,
 * a row of buttons), and within it to the one closest sideways to where the
 * focus is — moving down a page of rows keeps to roughly the same column.
 */
export function pickNext(from: Box, boxes: readonly Box[], direction: Direction): number {
  const horizontal = direction === 'left' || direction === 'right'
  const fromCenterX = (from.left + from.right) / 2
  const fromCenterY = (from.top + from.bottom) / 2

  if (horizontal) {
    let best = -1
    let bestScore = Infinity
    boxes.forEach((box, i) => {
      const centerX = (box.left + box.right) / 2
      const ahead = direction === 'right' ? centerX > fromCenterX + 1 && box.right > from.right : centerX < fromCenterX - 1 && box.left < from.left
      if (!ahead) return
      const shared = overlap(from.top, from.bottom, box.top, box.bottom)
      if (shared <= 0) return
      const gap = direction === 'right' ? Math.max(0, box.left - from.right) : Math.max(0, from.left - box.right)
      // Mostly the distance; a box that shares only a sliver of the row loses to one level with it
      const misalignment = Math.abs((box.top + box.bottom) / 2 - fromCenterY)
      const score = gap + misalignment * 0.5
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    })
    return best
  }

  // Up/down: first the nearest line, then the closest within it
  const distances = boxes.map((box) => {
    const centerY = (box.top + box.bottom) / 2
    const ahead = direction === 'down' ? centerY > fromCenterY + 1 && box.bottom > from.bottom : centerY < fromCenterY - 1 && box.top < from.top
    if (!ahead) return Infinity
    return direction === 'down' ? Math.max(0, box.top - from.bottom) : Math.max(0, from.top - box.bottom)
  })
  const nearest = Math.min(...distances)
  if (!Number.isFinite(nearest)) return -1
  let best = -1
  let bestScore = Infinity
  boxes.forEach((box, i) => {
    if (distances[i] > nearest + LINE_SLACK_PX) return
    // Sideways distance: none when the box spans the focus's middle
    const sideways = fromCenterX < box.left ? box.left - fromCenterX : fromCenterX > box.right ? fromCenterX - box.right : 0
    const score = sideways + distances[i] * 0.25
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
