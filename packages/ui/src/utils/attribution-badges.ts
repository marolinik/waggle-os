/**
 * Attribution badge rendering — converts attribution markers in HTML
 * to styled badge spans for the chat UI.
 *
 * Markers: [workspace memory], [personal memory], [KVARK: type: title]
 */

const WORKSPACE_PATTERN = /\[workspace memory\]/g;
const PERSONAL_PATTERN = /\[personal memory\]/g;
const KVARK_PATTERN = /\[KVARK:\s*([^\]]+)\]/g;

function badge(className: string, label: string, title: string): string {
  return `<span class="attribution-badge ${className}" title="${title}">${label}</span>`;
}

/**
 * Replace attribution markers in HTML with styled badge spans.
 * Only matches exact patterns — [workspace memory], [personal memory], [KVARK: ...].
 */
export function renderAttributionBadges(html: string): string {
  let result = html;

  result = result.replace(WORKSPACE_PATTERN, () =>
    badge('attribution-badge--workspace', 'workspace memory', 'From workspace memory'),
  );

  result = result.replace(PERSONAL_PATTERN, () =>
    badge('attribution-badge--personal', 'personal memory', 'From personal memory'),
  );

  result = result.replace(KVARK_PATTERN, (_, content: string) =>
    badge('attribution-badge--kvark', `KVARK: ${content.trim()}`, 'From enterprise documents (KVARK)'),
  );

  return result;
}
