/**
 * Valid officer case status transitions.
 */
const TRANSITIONS = {
  queued:    ['in_review'],
  in_review: ['approved', 'rejected'],
  approved:  [],
  rejected:  []
};

/**
 * Check if a status transition is valid.
 */
exports.canTransition = (from, to) => {
  return TRANSITIONS[from]?.includes(to) ?? false;
};

/**
 * Assert transition is valid — throws if not.
 */
exports.assertTransition = (from, to) => {
  if (!exports.canTransition(from, to)) {
    throw new Error(`Invalid case transition: ${from} → ${to}`);
  }
};