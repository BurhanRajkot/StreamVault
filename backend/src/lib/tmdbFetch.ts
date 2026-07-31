import https from 'node:https'
import dns from 'node:dns'
import './loadEnv'

/**
 * Drop-in `fetch` for TMDB requests that can be pinned to IPv4.
 *
 * Why: on a network where IPv6 is advertised but blackholed (an address and
 * default route exist, but no packets get through), TMDB's hostnames resolve to
 * eight AAAA records ahead of any A records. Bun's fetch works through that list
 * without Happy Eyeballs-style fallback, so every request stalls until it times
 * out — while curl, which races both families, succeeds over IPv4. Neither
 * `dns.setDefaultResultOrder('ipv4first')` nor `bun --dns-result-order=ipv4first`
 * changes this, but `node:https` does honour a custom `lookup`.
 *
 * Off by default, so deployed environments keep using plain `fetch`. Set
 * TMDB_FORCE_IPV4=true to enable it (see .env.local).
 */

const FORCE_IPV4 = /^(1|true|yes)$/i.test(process.env.TMDB_FORCE_IPV4?.trim() ?? '')

/**
 * Resolves A records only. Passing the original hostname through to
 * `https.request` (rather than connecting to a bare IP) keeps SNI and
 * certificate verification correct without any manual `servername` handling.
 */
const ipv4Lookup: NonNullable<https.RequestOptions['lookup']> = (hostname, options, callback) => {
  dns.resolve4(hostname, (err, addresses) => {
    if (err) return callback(err, '', 4)
    if (!addresses?.length) {
      return callback(new Error(`No A record for ${hostname}`), '', 4)
    }
    if (typeof options === 'object' && options?.all) {
      const all = addresses.map(address => ({ address, family: 4 as const }))
      return (callback as unknown as (e: NodeJS.ErrnoException | null, a: typeof all) => void)(null, all)
    }
    callback(null, addresses[0], 4)
  })
}

function requestOverIpv4(url: string, init: RequestInit | undefined): Promise<Response> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const signal = init?.signal ?? undefined

    if (signal?.aborted) {
      return reject(signal.reason ?? new Error('Aborted'))
    }

    const req = https.request(
      {
        protocol: target.protocol,
        host: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: init?.method ?? 'GET',
        headers: init?.headers as Record<string, string> | undefined,
        lookup: ipv4Lookup,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk as Buffer))
        res.on('error', reject)
        res.on('end', () => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue
            // node lowercases header names; set-cookie arrives as an array
            for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v)
          }
          // 204/304 must not carry a body when constructing a Response.
          const status = res.statusCode ?? 502
          const body = status === 204 || status === 304 ? null : Buffer.concat(chunks)
          resolve(new Response(body, { status, statusText: res.statusMessage, headers }))
        })
      }
    )

    const onAbort = () => {
      req.destroy()
      reject(signal?.reason ?? new Error('Aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    req.on('close', () => signal?.removeEventListener('abort', onAbort))

    req.on('error', reject)

    if (init?.body) req.write(init.body)
    req.end()
  })
}

export function tmdbFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!FORCE_IPV4) return fetch(url, init)
  return requestOverIpv4(url, init)
}
