import 'express-oauth2-jwt-bearer'

declare module 'express-oauth2-jwt-bearer' {
  interface AuthResult {
    payload: {
      sub: string
      [key: string]: any
    }
  }
}
