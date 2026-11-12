import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRAME_SRC_DIRECTIVE } from '../../scripts/gen-csp'
import { CONFIG } from './config'

const root = join(import.meta.dir, '..', '..')

/** The `frame-src ...` directive out of a host config file's CSP header. */
function frameSrcIn(file: string): string {
  const match = readFileSync(join(root, file), 'utf8').match(/frame-src [^;"]*/)
  if (!match) throw new Error(`no frame-src directive in ${file}`)
  return match[0].trim()
}

// The CSP header lives in the hosts' own config files, which can't import
// config.ts, so it is pasted by hand from `npm run gen:csp`. A frame-src that
// misses a host a player lands on renders that server as a blank, blocked
// frame in production while it works everywhere else.
describe('CSP frame-src', () => {
  for (const file of ['vercel.json', 'netlify.toml']) {
    it(`${file} carries exactly what gen:csp prints`, () => {
      expect(frameSrcIn(file)).toBe(FRAME_SRC_DIRECTIVE)
    })
  }

  it('allows every host a player can land on, redirects included', () => {
    for (const host of CONFIG.STREAMING_DOMAINS) {
      expect(FRAME_SRC_DIRECTIVE).toContain(`https://${host}`)
    }
  })
})
