import {spawn} from 'node:child_process';
import {CoreError} from './errors.js';

export function openExternal(url: string, websiteOrigin: string | null, enabled: boolean): {opened: boolean; reason?: 'DISABLED'} {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new CoreError('CORE_URL_NOT_ALLOWED', 400); }
  if (!websiteOrigin || parsed.origin !== websiteOrigin || parsed.username || parsed.password) throw new CoreError('CORE_URL_NOT_ALLOWED', 400);
  if (!enabled) return {opened: false, reason: 'DISABLED'};
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', parsed.href] : [parsed.href];
  const child = spawn(command, args, {detached: true, stdio: 'ignore'});
  child.unref();
  return {opened: true};
}
