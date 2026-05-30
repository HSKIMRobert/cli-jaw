/**
 * Strip interview tracker data from user-visible text.
 * Removes both XML-tagged blocks and raw known:/unknown: arrays.
 * Use at every broadcast point — pipeline, lifecycle-handler, etc.
 */
export function stripInterviewTracker(text: string): string {
  let result = text;
  // 1. XML-tagged tracker blocks
  result = result.replace(/<interview_tracker>[\s\S]*?<\/interview_tracker>/g, '');
  // 2. Raw tracker arrays — only at line start (not inline mentions in prose)
  result = result.replace(/(?:^|\n)known:\s*\[(?:[^\[\]]*|\[(?:[^\[\]]*|\[[^\[\]]*\])*\])*\]\s*(?:$|\n)/gm, '\n');
  result = result.replace(/(?:^|\n)unknown:\s*\[(?:[^\[\]]*|\[(?:[^\[\]]*|\[[^\[\]]*\])*\])*\]\s*(?:$|\n)/gm, '\n');
  // 3. Assessment line at start of line
  result = result.replace(/(?:^|\n)assessment:\s*\{[^}]*\}\s*(?:$|\n)/gm, '\n');
  // 4. Perspective tags
  result = result.replace(/\n*\[Perspective:.*?\]/g, '');
  return result.trim();
}
