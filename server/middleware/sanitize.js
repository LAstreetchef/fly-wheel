// server/middleware/sanitize.js
// Sanitizes user input to prevent injection attacks

function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return str;
  return str
    .trim()
    .slice(0, maxLength)
    // Remove potential SQL injection chars (belt-and-suspenders with parameterized queries)
    .replace(/[;'"\\]/g, '')
    // Remove potential HTML/script injection
    .replace(/<[^>]*>/g, '');
}

function sanitizeBody(fields = [], maxLength = 500) {
  return (req, res, next) => {
    if (!req.body) return next();
    for (const field of fields) {
      if (req.body[field]) {
        req.body[field] = sanitizeString(req.body[field], maxLength);
      }
    }
    next();
  };
}

function sanitizeQuery(fields = [], maxLength = 200) {
  return (req, res, next) => {
    for (const field of fields) {
      if (req.query[field]) {
        req.query[field] = sanitizeString(req.query[field], maxLength);
      }
    }
    next();
  };
}

export { sanitizeString, sanitizeBody, sanitizeQuery };
