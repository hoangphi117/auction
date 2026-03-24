// Custom Error Classes
export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 403;
  }
}

export class ValidationError extends Error {
  constructor(message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

/**
 * Async handler wrapper for Express routes
 * Eliminates need for try-catch blocks in every async route handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(error => {
        console.error('Route error:', error);
        
        // Handle custom errors
        if (error.name === 'NotFoundError') {
          return res.status(404).json({ success: false, message: error.message });
        }
        if (error.name === 'UnauthorizedError') {
          return res.status(403).json({ success: false, message: error.message });
        }
        if (error.name === 'ValidationError') {
          return res.status(400).json({ success: false, message: error.message });
        }
        if (error.name === 'ConflictError') {
          return res.status(409).json({ success: false, message: error.message });
        }
        
        // Handle specific error messages from models
        if (error.message === 'Product not found') {
          return res.status(404).json({ success: false, message: 'Product not found' });
        }
        if (error.message === 'Unauthorized') {
          return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        // Default server error
        res.status(500).json({ success: false, message: 'Server error' });
      });
  };
}

/**
 * Async handler for routes that render views instead of returning JSON
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export function asyncHandlerView(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(error => {
        console.error('Route error:', error);
        
        // Handle custom errors with appropriate error pages
        if (error.name === 'NotFoundError' || error.message === 'Product not found') {
          return res.status(404).render('404', { message: error.message });
        }
        if (error.name === 'UnauthorizedError' || error.message === 'Unauthorized') {
          return res.status(403).render('403', { message: 'You do not have permission to access this resource' });
        }
        
        // Default server error
        res.status(500).render('500', { message: 'An error occurred. Please try again later.' });
      });
  };
}
