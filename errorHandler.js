/**
 * src/middleware/errorHandler.js
 * Global Express error handler — catches all unhandled errors.
 */
'use strict';

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred.'
    : err.message || 'Internal Server Error';

  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
