// Wraps async route handlers so rejected promises reach the error middleware.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const send = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });
