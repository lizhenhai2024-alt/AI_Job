const MOVED_MESSAGE = 'AI_Job is discovery/intelligence only. Final S/A/B, match score, role direction, company fit and application recommendation are owned by campus-job-board.';

/**
 * Compatibility fence only.
 *
 * The previous candidate-fit scoring engine was intentionally removed from AI_Job.
 * Keep these exports temporarily so repository checks or stale callers fail loudly
 * instead of silently reintroducing a second final-decision algorithm.
 */
export function evaluateJob() {
  throw new Error(MOVED_MESSAGE);
}

export function rankJobs() {
  throw new Error(MOVED_MESSAGE);
}
