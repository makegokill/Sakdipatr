// Application errors. Every error that should reach the user carries a stable
// `code` (for the front end) and a Thai `message` (shown as-is).
function appError_(code, message, extra) {
  var e = new Error(message);
  e.isAppError = true;
  e.code = code;
  e.extra = extra || null;
  return e;
}
