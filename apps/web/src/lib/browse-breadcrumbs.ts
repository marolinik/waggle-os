/**
 * Breadcrumb helper for the local-browse dialog.
 *
 * On Windows the sidecar returns paths like `C:\Users\Marko`. The old
 * breadcrumb rendering split on `/` only, so Windows paths collapsed
 * into a single unusable crumb. This helper normalises across both
 * separator styles, keeping virtual (POSIX) storage untouched.
 *
 * P14 scope extension: enabling drive enumeration at the API level
 * (see `browse-helpers.ts`) only helps if the UI can walk the resulting
 * paths. Splitting logic lives here, tested independently.
 */

export type StorageBrowseType = 'local' | 'virtual' | 'team';

export interface Crumb {
  label: string;
  path: string;
}

const WINDOWS_DRIVE_RE = /^([A-Za-z]):[\\/]?/;

/**
 * Break a `currentPath` into navigable crumbs.
 *
 * - `'/'` always resolves to a single root crumb.
 * - Local paths on Windows keep backslashes in the `path` field so the
 *   server can resolve them natively; only the strip labels are friendly.
 * - Virtual/team paths (POSIX) split on `/` and reassemble with `/`.
 */
export function buildBreadcrumbs(
  currentPath: string,
  rootLabel: string,
  storageType: StorageBrowseType,
): Crumb[] {
  if (currentPath === '/' || currentPath === '' || currentPath === '\\') {
    return [{ label: rootLabel, path: '/' }];
  }

  if (storageType === 'local') {
    return buildLocalCrumbs(currentPath, rootLabel);
  }
  return buildPosixCrumbs(currentPath, rootLabel);
}

function buildLocalCrumbs(currentPath: string, rootLabel: string): Crumb[] {
  const match = currentPath.match(WINDOWS_DRIVE_RE);

  if (match) {
    const driveLetter = match[1].toUpperCase();
    const drivePath = `${driveLetter}:\\`;
    const rest = currentPath.slice(match[0].length);
    const parts = splitPathParts(rest);

    const crumbs: Crumb[] = [
      { label: rootLabel, path: '/' },
      { label: `${driveLetter}:`, path: drivePath },
    ];

    let acc = drivePath;
    for (const part of parts) {
      acc = joinWindows(acc, part);
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }

  return buildPosixCrumbs(currentPath, rootLabel);
}

function buildPosixCrumbs(currentPath: string, rootLabel: string): Crumb[] {
  const parts = splitPathParts(currentPath);
  const crumbs: Crumb[] = [{ label: rootLabel, path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc = `${acc}/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

function splitPathParts(p: string): string[] {
  return p.split(/[\\/]/).filter((s) => s.length > 0);
}

function joinWindows(base: string, part: string): string {
  return base.endsWith('\\') ? `${base}${part}` : `${base}\\${part}`;
}
