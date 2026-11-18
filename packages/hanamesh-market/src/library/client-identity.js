/**
 * Which client this host runs in, for the install-target probe: 'hanamesh' (the HanaMesh desktop client) or 'dsh'
 * (plain DSH, desktop or CLI). The only fact used is the bundle identifier of the macOS application that contains the
 * desktop runtime — C-DESKTOP-HOST fixes it to `com.hanamesh.desktop` (DSH_DESKTOP_APP_ID). `evidence` says what was
 * seen, so a wrong answer can be traced instead of guessed at.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, sep } from 'node:path';

export const HANAMESH_BUNDLE_ID = 'com.hanamesh.desktop';

/** `<X>.app` directory that contains `path`, or undefined. */
export function containingApp(path) {
  if (typeof path !== 'string') return undefined;
  const parts = path.split(sep), index = parts.findLastIndex(part => part.endsWith('.app'));
  return index > 0 ? parts.slice(0, index + 1).join(sep) : undefined;
}

export async function detectClient({ desktop, platform = process.platform, readBundleId } = {}) {
  if (!desktop) return { client: 'dsh', evidence: 'not-desktop' };
  const app = containingApp(desktop.desktopCli?.runtimeDir ?? desktop.runtimeDir);
  if (!app) return { client: 'dsh', evidence: 'desktop-without-app-bundle' };
  if (platform !== 'darwin' && !readBundleId) return { client: 'dsh', evidence: `app-bundle-unreadable-on-${platform}` };
  let id;
  try {
    id = readBundleId ? await readBundleId(app) : (await promisify(execFile)('/usr/bin/plutil',
      ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(app, 'Contents', 'Info.plist')])).stdout.trim();
  } catch (error) { return { client: 'dsh', evidence: `bundle-id-unreadable:${error.code ?? error.message}` }; }
  return { client: id === HANAMESH_BUNDLE_ID ? 'hanamesh' : 'dsh', evidence: `bundle-id:${id}` };
}
