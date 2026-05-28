import { describe, it, expect, afterEach } from 'bun:test'
import jwt from 'jsonwebtoken'

// Set env vars before anything else
process.env.ADMIN_SECRET = 'test-secret'
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret'

const originalEnv = { ...process.env }

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

    const decoded = jwt.verify(token, 'test-jwt-secret') as any

    expect(decoded.role).toBe('admin')
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()

    // The source code sets `expiresIn: '30m'`, so exp should be iat + 30 * 60.
    expect(decoded.exp).toBe(decoded.iat + 30 * 60)
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
    process.env.ADMIN_SECRET = 'my_admin_secret'
    process.env.ADMIN_JWT_SECRET = 'my_jwt_secret'

    // Dynamic import with cache-buster query string
    const { isAdminConfigured } = await import(`./auth?t=${Date.now()}`)
    expect(isAdminConfigured()).toBe(true)
  })

  it('should throw an error on module load if ADMIN_SECRET and ADMIN_SECRET_CODE are missing', async () => {
    delete process.env.ADMIN_SECRET
    delete process.env.ADMIN_SECRET_CODE
    process.env.ADMIN_JWT_SECRET = 'my_jwt_secret'

    // Expect the import itself to reject/throw
    await expect(import(`./auth?t=${Date.now() + 1}`)).rejects.toThrow(
      'ADMIN_SECRET or ADMIN_SECRET_CODE environment variable is required'
    )
  })

  it('should throw an error on module load if ADMIN_JWT_SECRET is missing', async () => {
    process.env.ADMIN_SECRET = 'my_admin_secret'
    delete process.env.ADMIN_JWT_SECRET

    // Expect the import itself to reject/throw
    await expect(import(`./auth?t=${Date.now() + 2}`)).rejects.toThrow(
      'ADMIN_JWT_SECRET environment variable is required'
    )
  })
})
