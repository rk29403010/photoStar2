export type TabId = 'file' | 'analysis' | 'people' | 'json' | 'ailogs';

export function shortPath(path: string) {
  const parts = path.split(/[/\\]/);
  return parts.length >= 2 ? `…/${parts[parts.length - 2]}/${parts[parts.length - 1]}` : path;
}

export function shortPathDir(path: string) {
  const parts = path.split(/[/\\]/);
  parts.pop(); // Remove filename
  if (parts.length === 0) {
    return '/';
  }
  return parts.length >= 2 ? `…/${parts[parts.length - 2]}/${parts[parts.length - 1]}/` : `${parts.join('/')}/`;
}
