/**
 * Request logging middleware
 */

export function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    };
    
    // Only log in development or for errors
    if (process.env.NODE_ENV !== 'production' || res.statusCode >= 400) {
      console.log(JSON.stringify(log));
    }
  });
  
  next();
}
