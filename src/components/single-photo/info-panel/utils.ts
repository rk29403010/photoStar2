export type TabId = 'file' | 'analysis' | 'people' | 'json';

export function shortPath(path: string) {
  const parts = path.split(/[/\\]/);
  return parts.length >= 2 ? `…/${parts[parts.length - 2]}/${parts[parts.length - 1]}` : path;
}
