import fs from 'node:fs';
import path from 'node:path';

// Resolve against the web origin, not the host filesystem root.
// Directory URLs must have an actual index page in the static site.
export function localReferenceExists(siteRoot, page, reference) {
  const origin = 'https://site.invalid';
  const url = new URL(reference, new URL('/' + page, origin));
  if (url.origin !== origin) return false;
  const target = path.resolve(siteRoot, '.' + decodeURIComponent(url.pathname));
  const relative = path.relative(siteRoot, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return false;
  const stat = fs.statSync(target, {throwIfNoEntry:false});
  if (stat?.isDirectory()) return fs.statSync(path.join(target,'index.html'), {throwIfNoEntry:false})?.isFile() ?? false;
  return stat?.isFile() ?? false;
}
