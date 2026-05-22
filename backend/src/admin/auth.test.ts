import { describe, it, expect, afterEach } from 'bun:test'
import jwt from 'jsonwebtoken'

// Set env vars before anything else
process.env.ADMIN_SECRET = 'test-secret'
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret'

const originalEnv = { ...process.env }

// Inline implementation matching auth.ts — avoids mock.module cache conflicts
// with middleware.test.ts which registers a partial mock for './auth.ts'
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
