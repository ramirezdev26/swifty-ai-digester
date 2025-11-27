import { Histogram, Counter, Gauge } from 'prom-client';

/**
 * Gemini API Request Duration - Duration of Gemini API calls
 * Labels: style, status
 */
export const geminiRequestDuration = new Histogram({
  name: 'swifty_ai_digester_gemini_request_duration_seconds',
  help: 'Duration of Gemini AI API requests in seconds',
  labelNames: ['style', 'status'],
  buckets: [1, 2.5, 5, 10, 15, 20, 30, 45, 60], // Gemini can be slow
});

/**
 * Gemini API Requests Total - Counter of requests
 * Labels: style, status (success, error, rate_limited)
 */
export const geminiRequestsTotal = new Counter({
  name: 'swifty_ai_digester_gemini_requests_total',
  help: 'Total number of Gemini AI API requests',
  labelNames: ['style', 'status'],
});

/**
 * Gemini Rate Limit Hits - Counter of rate limit hits
 * Labels: style
 */
export const geminiRateLimitHits = new Counter({
  name: 'swifty_ai_digester_gemini_rate_limit_hits_total',
  help: 'Total number of Gemini AI rate limit hits',
  labelNames: ['style'],
});

/**
 * Gemini Retry Attempts - Counter of retry attempts
 * Labels: style, attempt_number
 */
export const geminiRetryAttempts = new Counter({
  name: 'swifty_ai_digester_gemini_retry_attempts_total',
  help: 'Total number of Gemini AI retry attempts',
  labelNames: ['style', 'attempt_number'],
});

/**
 * Gemini Tokens Used - Histogram of consumed tokens
 * Labels: style
 */
export const geminiTokensUsed = new Histogram({
  name: 'swifty_ai_digester_gemini_tokens_used',
  help: 'Number of tokens used per Gemini AI request',
  labelNames: ['style'],
  buckets: [100, 500, 1000, 2500, 5000, 10000, 25000], // Depends on image size
});

/**
 * Gemini Active Requests - Gauge of active requests
 */
export const geminiActiveRequests = new Gauge({
  name: 'swifty_ai_digester_gemini_active_requests',
  help: 'Number of active Gemini AI requests',
});

/**
 * Gemini Errors by Type - Errors by type
 * Labels: error_type, style
 */
export const geminiErrorsByType = new Counter({
  name: 'swifty_ai_digester_gemini_errors_by_type_total',
  help: 'Total number of Gemini AI errors by type',
  labelNames: ['error_type', 'style'],
});

/**
 * Gemini Backoff Duration - Duration of backoff delays
 * Labels: style, attempt_number
 */
export const geminiBackoffDuration = new Histogram({
  name: 'swifty_ai_digester_gemini_backoff_duration_seconds',
  help: 'Duration of exponential backoff delays in seconds',
  labelNames: ['style', 'attempt_number'],
  buckets: [1, 2, 4, 8, 16, 32, 64], // Exponential backoff pattern
});

