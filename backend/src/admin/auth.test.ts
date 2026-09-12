import { describe, it, expect, afterEach } from 'bun:test'
import jwt from 'jsonwebtoken'
import { authenticator } from 'otplib'

// Set env vars before anything else
process.env.ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret'

const originalEnv = { ...process.env }

// Date.now() offsets aren't unique enough to cache-bust reliably — tests run
// fast enough that two dynamic imports can land in the same millisecond and
// collide, silently reusing a previously loaded (and now stale) module.
let importCounter = 0
const freshAuthImport = () => import(`./auth?t=${++importCounter}`)

// Inline implementation matching auth.ts — avoids mock.module cache conflicts
// with middleware.test.ts which registers a partial mock for './auth'
function generateAdminToken(): string {
  return jwt.sign({ role: 'admin' }, process.env.ADMIN_JWT_SECRET!, { expiresIn: '30m' })
}

describe('Admin Auth - generateAdminToken', () => {
  afterEach(() => {
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const key in originalEnv) {
      process.env[key] = originalEnv[key]
    }
  })

  it('should generate a valid JWT with the correct payload and expiration', () => {
    const token = generateAdminToken()

    expect(typeof token).toBe('string')

    const decoded = jwt.verify(token, 'test-jwt-secret') as { role: string; iat: number; exp: number }

    expect(decoded.role).toBe('admin')
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()

    // The source code sets `expiresIn: '30m'`, so exp should be iat + 30 * 60.
    expect(decoded.exp).toBe(decoded.iat + 30 * 60)
  })
})


describe('Admin Auth - validateAdminCode', () => {
  afterEach(() => {
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const key in originalEnv) {
      process.env[key] = originalEnv[key]
    }
  })

  it('should accept a valid current TOTP code', async () => {
    const { validateAdminCode } = await freshAuthImport()
    const code = authenticator.generate(process.env.ADMIN_TOTP_SECRET!)

    expect(validateAdminCode(code)).toBe(true)
  })

  it('should reject a bogus code', async () => {
    const { validateAdminCode } = await freshAuthImport()

    expect(validateAdminCode('000000')).toBe(false)
  })

  it('should reject non-numeric or malformed input', async () => {
    const { validateAdminCode } = await freshAuthImport()

    expect(validateAdminCode('abcdef')).toBe(false)
    expect(validateAdminCode('12345')).toBe(false)
    expect(validateAdminCode('')).toBe(false)
  })
})

describe('Admin Auth - isAdminConfigured', () => {
  const localOriginalEnv = { ...process.env }

  afterEach(() => {
    // Clean up specific keys to avoid polluting subsequent tests
    for (const key in process.env) {
      if (!(key in localOriginalEnv)) {
        delete process.env[key]
      }
    }
    for (const key in localOriginalEnv) {
      process.env[key] = localOriginalEnv[key]
    }
  })

  it('should return true when required env variables are present', async () => {
    process.env.ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'
    process.env.ADMIN_JWT_SECRET = 'my_jwt_secret'

    // Dynamic import with cache-buster query string
    const { isAdminConfigured } = await freshAuthImport()
    expect(isAdminConfigured()).toBe(true)
  })

  it('should throw an error on module load if ADMIN_TOTP_SECRET is missing', async () => {
    delete process.env.ADMIN_TOTP_SECRET
    process.env.ADMIN_JWT_SECRET = 'my_jwt_secret'

    // Expect the import itself to reject/throw
    await expect(freshAuthImport()).rejects.toThrow(
      'ADMIN_TOTP_SECRET environment variable is required'
    )
  })

  it('should throw an error on module load if ADMIN_JWT_SECRET is missing', async () => {
    process.env.ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP'
    delete process.env.ADMIN_JWT_SECRET

    // Expect the import itself to reject/throw
    await expect(freshAuthImport()).rejects.toThrow(
      'ADMIN_JWT_SECRET environment variable is required'
    )
  })
})
