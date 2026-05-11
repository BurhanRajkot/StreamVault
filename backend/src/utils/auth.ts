import { Request } from 'express'

export function getUserId(req: Request) {
  return (req as any).auth?.payload?.sub as string | undefined
}
