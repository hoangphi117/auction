/**
 * Flash messages middleware
 * Extracts flash messages from session and makes them available to views via res.locals
 * Eliminates repetitive message handling code in route handlers
 */
export function flashMessages(req, res, next) {
  res.locals.success_message = req.session.success_message;
  res.locals.error_message = req.session.error_message;
  
  delete req.session.success_message;
  delete req.session.error_message;
  
  next();
}

/**
 * Set flash message helper
 * Can be attached to req object for easy access in route handlers
 */
export function setFlashMessage(req, type, message) {
  if (type === 'success') {
    req.session.success_message = message;
  } else if (type === 'error') {
    req.session.error_message = message;
  }
}

/**
 * Middleware to attach flash helpers to req object
 */
export function flashHelpers(req, res, next) {
  req.flash = function(type, message) {
    setFlashMessage(req, type, message);
  };
  next();
}
