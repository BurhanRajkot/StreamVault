import { describe, it, expect } from 'bun:test'
import { getUserId } from './auth'
import { Request } from 'express'

describe('getUserId', () => {
  it('should return the user ID when req.auth.payload.sub exists', () => {
    const req = {
      auth: {
        payload: {
          sub: 'user-123'
        }
      }
    } as unknown as Request
    expect(getUserId(req)).toBe('user-123')
  })

  it('should return undefined when req.auth is missing', () => {
    const req = {} as unknown as Request
    expect(getUserId(req)).toBeUndefined()
  })

  it('should return undefined when req.auth.payload is missing', () => {
    const req = {
      auth: {}
    } as unknown as Request
    expect(getUserId(req)).toBeUndefined()
  })

  it('should return undefined when req.auth.payload.sub is missing', () => {
    const req = {
      auth: {
        payload: {}
      }
    } as unknown as Request
    expect(getUserId(req)).toBeUndefined()
  })
})
