const MOVED_MESSAGE = 'AI_Job no longer builds candidate-fit shortlists. Final ranking and application priority belong to campus-job-board.';

/** Compatibility fence for stale callers. */
export function buildDailyShortlist() {
  throw new Error(MOVED_MESSAGE);
}

export function dailyShortlistStats() {
  throw new Error(MOVED_MESSAGE);
}
