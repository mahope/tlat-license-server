/**
 * Error handling middleware
 */

export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`
  });
}

export function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // SQLite errors
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(409).json({
      error: 'conflict',
      message: 'Resource already exists'
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Invalid token provided'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'token_expired',
      message: 'Token has expired'
    });
  }
  
  // Default error
  res.status(500).json({
    error: 'internal_error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An internal error occurred' 
      : err.message
  });
}
