/**
 * SchroDrive Media Manager — Structured Logger
 *
 * JSON-structured logger with secret redaction and
 * Australia/Sydney timezone timestamps.
 *
 * @module utils/logger
 */

/** Supported log levels, ordered by severity. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Patterns known to contain secrets — these get redacted from log output. */
const SECRET_PATTERNS: RegExp[] = [
  /(?:token|api[_-]?key|password|secret|authorization)["\s:=]+["']?[A-Za-z0-9_\-/.]{8,}["']?/gi,
  /X-Plex-Token=[A-Za-z0-9_-]+/gi,
  /Bearer\s+[A-Za-z0-9_\-/.]+/gi,
];

/**
 * Redacts known secret patterns from a string.
 * Replaces the secret value with `[REDACTED]`.
 *
 * @param input - The string to sanitise.
 * @returns The sanitised string with secrets removed.
 */
export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      const separatorIdx = match.search(/[=:"']\s*/);
      if (separatorIdx !== -1) {
        const prefix = match.slice(0, separatorIdx + 1);
        return `${prefix}[REDACTED]`;
      }
      return '[REDACTED]';
    });
  }
  return result;
}

/**
 * Returns the current timestamp in ISO format using Australia/Sydney timezone.
 */
function getTimestamp(): string {
  return new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).replace(',', '');
}

/** Structured log entry shape written to stdout. */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  [key: string]: unknown;
}

/**
 * Creates a structured logger instance with an optional context label.
 *
 * @param context - Optional label identifying the subsystem (e.g. 'server', 'db').
 * @returns A logger object with debug, info, warn, and error methods.
 */
export function createLogger(context?: string) {
  const currentLevel: LogLevel =
    (process.env['LOG_LEVEL'] as LogLevel) || 'info';

  function shouldLog(level: LogLevel): boolean {
    return (
      LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel]
    );
  }

  function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: getTimestamp(),
      level,
      message: redactSecrets(message),
    };

    if (context) entry.context = context;

    if (meta) {
      for (const [key, value] of Object.entries(meta)) {
        entry[key] =
          typeof value === 'string' ? redactSecrets(value) : value;
      }
    }

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    /** Log a debug-level message. */
    debug: (message: string, meta?: Record<string, unknown>) =>
      write('debug', message, meta),

    /** Log an info-level message. */
    info: (message: string, meta?: Record<string, unknown>) =>
      write('info', message, meta),

    /** Log a warn-level message. */
    warn: (message: string, meta?: Record<string, unknown>) =>
      write('warn', message, meta),

    /** Log an error-level message. */
    error: (message: string, meta?: Record<string, unknown>) =>
      write('error', message, meta),
  };
}

/** Default application-wide logger instance. */
export const logger = createLogger('schrodrive');
