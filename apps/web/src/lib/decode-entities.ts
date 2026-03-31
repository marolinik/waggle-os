/**
 * Decode HTML entities in a string (e.g. &#x27; → ').
 * Safe: uses a textarea which only decodes entities — does not execute scripts.
 * The textarea.innerHTML setter decodes entities, and textarea.value returns plain text.
 */
export function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}
