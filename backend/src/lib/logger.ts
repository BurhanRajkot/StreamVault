/**
 * 📝 PRODUCTION LOGGING UTILITY
 *
 * Replaces console.log with environment-aware logging
 * - Development: Full logging to console
 * - Production: Structured logging with levels
 *
 * Usage:
 *   logger.info('User logged in', { userId: '123' })
 *   logger.error('Database error', { error: err.message })
 *   logger.warn('Rate limit approaching', { ip: req.ip })
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class Logger {
  private isDevelopment: boolean

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production'
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString()

    if (this.isDevelopment) {
      // Development: Colorful console output
      const colors = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m',  // Green
        warn: '\x1b[33m',  // Yellow
        error: '\x1b[31m', // Red
      }
      const reset = '\x1b[0m'

      console.log(
        `${colors[level]}[${level.toUpperCase()}]${reset} ${timestamp} - ${message}`,
        context || ''
      )
    } else {
      // Production: Structured JSON logging (for log aggregation services)
      const logEntry = {
        timestamp,
        level,
        message,
        ...context,
      }

      // Only log warnings and errors in production to reduce noise
      if (level === 'warn' || level === 'error') {
        console.log(JSON.stringify(logEntry))
      }
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context)
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context)
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context)
  }
}

export const logger = new Logger()
export default logger
