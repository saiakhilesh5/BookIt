import { isProd } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // Mongoose: malformed ObjectId
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}`, 'INVALID_ID');
  }
  // Mongoose: schema validation
  else if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    error = ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details);
  }
  // Mongo duplicate key
  else if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    error = ApiError.conflict(`Duplicate value for ${field}`, 'DUPLICATE');
  }
  // Bad JSON body
  else if (err.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body', 'BAD_JSON');
  }

  const isApiError = error instanceof ApiError;
  const statusCode = isApiError ? error.statusCode : 500;
  const code = isApiError ? error.code : 'INTERNAL_ERROR';
  const message = isApiError ? error.message : 'Something went wrong';

  if (statusCode >= 500) {
    logger.error({ err, requestId: req.id }, 'Unhandled error');
  } else {
    logger.debug({ code, path: req.path }, message);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(isApiError?.details ? { details: error.details } : {}),
      ...(isProd ? {} : { stack: err.stack?.split('\n').slice(0, 4) }),
    },
  });
};
