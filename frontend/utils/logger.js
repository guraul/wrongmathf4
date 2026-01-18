/**
 * Frontend Logging Utility
 * 
 * Logs are displayed in console with styled output.
 * Logs are also sent to the backend API for persistent storage.
 * 
 * Usage:
 *   import logger from '@/utils/logger';
 *   logger.info('User logged in');
 *   logger.error('Failed to upload', { error });
 *   logger.debug('API response', data);
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class FrontendLogger {
  constructor() {
    this.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
    this.apiEndpoint = null;
    this.sessionId = this.generateSessionId();
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, data = null) {
    const timestamp = this.getTimestamp();
    const session = this.sessionId;
    let formatted = `[${timestamp}] [${level.toUpperCase()}] [${session}] ${message}`;
    if (data !== null) {
      try {
        formatted += '\n' + JSON.stringify(data, null, 2);
      } catch {
        formatted += '\n' + String(data);
      }
    }
    return formatted;
  }

  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  log(level, message, data = null) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, data);
    const styles = {
      debug: 'color: #6b7280; font-style: italic;',
      info: 'color: #3b82f6; font-weight: bold;',
      warn: 'color: #f59e0b; font-weight: bold;',
      error: 'color: #ef4444; font-weight: bold;',
    };

    // Console output with styling
    switch (level) {
      case 'debug':
        console.log(`%c${formatted}`, styles.debug);
        break;
      case 'info':
        console.log(`%c${formatted}`, styles.info);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }

    // Always send errors to backend
    if (level === 'error') {
      this.sendToBackend(level, message, data);
    }
  }

  async sendToBackend(level, message, data = null) {
    if (!this.apiEndpoint) {
      // Try to get from window location
      this.apiEndpoint = typeof window !== 'undefined' 
        ? window.location.origin.replace(':3000', ':8000') 
        : null;
    }
    
    if (!this.apiEndpoint) return;
    
    try {
      await fetch(`${this.apiEndpoint}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          message,
          data,
          sessionId: this.sessionId,
          timestamp: this.getTimestamp(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }),
      });
    } catch (e) {
      // Silently fail - we don't want logging to break the app
    }
  }

  configure(options = {}) {
    if (options.level !== undefined) {
      this.level = options.level;
    }
    if (options.apiEndpoint) {
      this.apiEndpoint = options.apiEndpoint;
    }
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  // Group related logs
  group(name, fn) {
    console.group(name);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }

  // Group with collapsed state
  groupCollapsed(name, fn) {
    console.groupCollapsed(name);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }

  // Measure time for operations
  time(label) {
    console.time(label);
  }

  timeEnd(label) {
    console.timeEnd(label);
  }
}

// Singleton instance
const logger = new FrontendLogger();

// Set up global error handler for unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    logger.error('Unhandled error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection', {
      reason: String(event.reason),
      stack: event.reason?.stack
    });
  });
}

export default logger;
