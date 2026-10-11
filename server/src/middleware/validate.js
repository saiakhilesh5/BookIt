import { ApiError } from '../utils/ApiError.js';

// Validates and replaces req.body / req.query / req.params with parsed Zod output.
const validate = (schemas) => (req, _res, next) => {
  try {
    for (const [key, schema] of Object.entries(schemas)) {
      if (schema) req[key] = schema.parse(req[key]);
    }
    next();
  } catch (err) {
    const details = err.issues?.map((i) => ({ path: i.path.join('.'), message: i.message }));
    next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details));
  }
};

export default validate;
