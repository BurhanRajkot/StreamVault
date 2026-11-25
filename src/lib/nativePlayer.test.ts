import { describe, expect, it } from 'bun:test'
import { toWebVtt } from './nativePlayer'

describe('toWebVtt', () => {
  const track = {
    longest: 3,
    cues: [
      { start: 1.5, end: 3, top: false, lines: [[{ text: 'Hello <there>', italic: false }], [{ text: 'friend', italic: true }]] },
      { start: 3661.25, end: 3662, top: true, lines: [[{ text: 'SIGN', italic: false }]] },
    ],
  }

  it('writes cues as WebVTT, italics kept and markup escaped', () => {
    expect(toWebVtt(track)).toBe(
      'WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nHello &lt;there&gt;\n<i>friend</i>\n\n01:01:01.250 --> 01:01:02.000 line:10%\nSIGN\n'
    )
  })

  it('shifts every cue by the delay, dropping any that would end before the start', () => {
    const vtt = toWebVtt(track, -3)
    expect(vtt).not.toContain('Hello')
    expect(vtt).toContain('01:00:58.250 --> 01:00:59.000')
  })
})
