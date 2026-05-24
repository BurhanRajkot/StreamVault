import { describe, it, expect, mock, beforeEach, afterAll, Mock } from 'bun:test'
import { Request, Response, NextFunction } from 'express'

// Mock the env vars BEFORE any imports
const originalEnv = { ...process.env }
process.env.ADMIN_SECRET = 'test-secret'
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret'

// Mock the auth module
mock.module('./auth', () => {
  return {
    verifyAdminToken: mock((token: string) => {
      if (token === 'valid-token') {
        return { role: 'admin', exp: 1234567890 }
      }
      return null
    })
  }
})

// Now require modules dynamically after setting env vars and mocking
// eslint-disable-next-line @typescript-eslint/no-require-imports
const middlewareModule = require('./middleware')
const { requireAdminAuth, optionalAdminAuth } = middlewareModule
// eslint-disable-next-line @typescript-eslint/no-require-imports
const authModule = require('./auth')
const { verifyAdminToken } = authModule

describe('Admin Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction
  let jsonMock: ReturnType<typeof mock>
  let statusMock: ReturnType<typeof mock>

  afterAll(() => {
    // Restore original environment variables manually without destroying process.env
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const key in originalEnv) {
      process.env[key] = originalEnv[key]
    }
  })

  beforeEach(() => {
    jsonMock = mock(() => mockRes)
    statusMock = mock(() => {
      return { json: jsonMock } as unknown as Response
    })

    mockReq = {
      headers: {},
    }

    mockRes = {
      status: statusMock as any,
      json: jsonMock as any,
    }

    mockNext = mock()

    // Reset the mock counts correctly
    ;(verifyAdminToken as Mock<any>).mockClear()
  })

  describe('requireAdminAuth', () => {
    it('should return 401 when authorization header is missing', () => {
      requireAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Admin token missing',
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 when authorization header does not start with "Bearer "', () => {
      mockReq.headers!.authorization = 'Basic some-token'

      requireAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Admin token missing',
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 when token is missing but "Bearer " is present', () => {
      mockReq.headers!.authorization = 'Bearer '

      requireAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Admin token missing',
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 when token is present but invalid', () => {
      mockReq.headers!.authorization = 'Bearer invalid-token'

      requireAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(verifyAdminToken).toHaveBeenCalledWith('invalid-token')
      expect(statusMock).toHaveBeenCalledWith(401)
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Invalid or expired admin token',
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should call next and attach payload when token is valid', () => {
      mockReq.headers!.authorization = 'Bearer valid-token'

      requireAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(verifyAdminToken).toHaveBeenCalledWith('valid-token')
      expect(mockReq.admin).toEqual({ role: 'admin', exp: 1234567890 })
      expect(mockNext).toHaveBeenCalled()
      expect(statusMock).not.toHaveBeenCalled()
    })
  })

  describe('optionalAdminAuth', () => {
    it('should call next and not attach payload when authorization header is missing', () => {
      optionalAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(mockReq.admin).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
      expect(statusMock).not.toHaveBeenCalled()
    })

    it('should call next and not attach payload when token is invalid', () => {
      mockReq.headers!.authorization = 'Bearer invalid-token'

      optionalAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(verifyAdminToken).toHaveBeenCalledWith('invalid-token')
      expect(mockReq.admin).toBeUndefined()
      expect(mockNext).toHaveBeenCalled()
      expect(statusMock).not.toHaveBeenCalled()
    })

    it('should call next and attach payload when token is valid', () => {
      mockReq.headers!.authorization = 'Bearer valid-token'

      optionalAdminAuth(mockReq as Request, mockRes as Response, mockNext)

      expect(verifyAdminToken).toHaveBeenCalledWith('valid-token')
      expect(mockReq.admin).toEqual({ role: 'admin', exp: 1234567890 })
      expect(mockNext).toHaveBeenCalled()
      expect(statusMock).not.toHaveBeenCalled()
    })
  })
})
