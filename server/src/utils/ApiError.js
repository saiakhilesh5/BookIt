export class ApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'Not authenticated', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }
  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }
  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }
  static conflict(message = 'Conflict', code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }
  static gone(message = 'Gone', code = 'GONE') {
    return new ApiError(410, code, message);
  }
  static paymentRequired(message = 'Payment failed', code = 'PAYMENT_FAILED') {
    return new ApiError(402, code, message);
  }
  static tooMany(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new ApiError(429, code, message);
  }
}
