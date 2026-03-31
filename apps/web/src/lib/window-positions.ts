const STORAGE_KEY = 'waggle:window-positions';

interface SavedPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getSavedPosition(appId: string): SavedPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const positions = JSON.parse(raw);
    return positions[appId] || null;
  } catch { return null; }
}

export function savePosition(appId: string, pos: SavedPosition): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '{}';
    const positions = JSON.parse(raw);
    positions[appId] = pos;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch { /* localStorage full or unavailable */ }
}
