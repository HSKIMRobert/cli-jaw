/**
 * Strip interview tracker data from user-visible text.
 * Removes both XML-tagged blocks and raw known:/unknown: arrays.
 * Use at every broadcast point — pipeline, lifecycle-handler, etc.
 */
export function stripInterviewTracker(text: string): string {
  return text
    .replace(/<interview_tracker>[\s\S]*?<\/interview_tracker>/g, '')
    .replace(/\n*(?:known|unknown)\s*:\s*\[(?:[^\[\]]*|\[(?:[^\[\]]*|\[[^\[\]]*\])*\])*\]/g, '')
    .replace(/\n*assessment:\s*\{[^}]*\}/g, '')
    .replace(/\n*\[Perspective:.*?\]/g, '')
    .trim();
}
