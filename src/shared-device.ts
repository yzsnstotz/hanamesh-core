import {randomBytes} from 'node:crypto';
import {link, mkdir, open, readFile, unlink} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {verifyDevice, type StoredDevice} from './device.js';
import {CoreError} from './errors.js';

/** One device identity per OS user, shared by every client (DSH, HanaMesh desktop) that loads Core.
 *  The file is write-once: the first client to claim it defines the machine identity, later claims read it back. */
export interface SharedDeviceStore {
  readonly location: string;
  /** null = no shared identity yet. Unreadable → CORE_DEVICE_STORE_UNAVAILABLE; malformed or key mismatch → CORE_DEVICE_CORRUPT. */
  read(): Promise<StoredDevice | null>;
  /** Atomically publish `device` unless a shared identity already exists; returns whichever identity won. */
  claim(device: StoredDevice): Promise<StoredDevice>;
}

/** Resolution order: plugin config `sharedIdentityDir`, env `HANAMESH_SHARED_HOME`, `~/.hanamesh-shared`. Both clients must
 *  resolve the same root, so the default is per OS user and never inside a client's own home (`~/.dsh`, `~/.hanamesh`). */
export function sharedIdentityRoot(config: {sharedIdentityDir?: string | null}, env: Record<string, string | undefined>, home: string): string {
  const explicit = config.sharedIdentityDir ?? (env['HANAMESH_SHARED_HOME']?.trim() || null);
  if (explicit !== null && (typeof explicit !== 'string' || !isAbsolute(explicit))) throw new CoreError('CORE_INPUT_INVALID', 400);
  return explicit ?? join(home, '.hanamesh-shared');
}

const code = (error: unknown): string | undefined => (error as NodeJS.ErrnoException | null)?.code;
/** Keeps the OS errno (EACCES, ENOSPC, …) so the settings section can say what actually failed. */
export type SharedStoreError = CoreError & {readonly detail: string | null};
const storeUnavailable = (error: unknown): SharedStoreError =>
  Object.assign(new CoreError('CORE_DEVICE_STORE_UNAVAILABLE', 503), {detail: code(error) ?? null});

function parseDevice(text: string): StoredDevice {
  let value: Record<string, unknown>;
  try { value = JSON.parse(text) as Record<string, unknown>; } catch { throw new CoreError('CORE_DEVICE_CORRUPT', 500); }
  if (!value || typeof value !== 'object' || value['schemaVersion'] !== 1) throw new CoreError('CORE_DEVICE_CORRUPT', 500);
  const {deviceId, publicKey, privateKeyPkcs8, createdAt} = value;
  if ([deviceId, publicKey, privateKeyPkcs8, createdAt].some(field => typeof field !== 'string' || !field)) throw new CoreError('CORE_DEVICE_CORRUPT', 500);
  const device = Object.freeze({deviceId, publicKey, privateKeyPkcs8, createdAt} as StoredDevice);
  verifyDevice(device);
  return device;
}

export function fileSharedDeviceStore(root: string): SharedDeviceStore {
  const dir = join(root, 'identity');
  const location = join(dir, 'device.json');
  const read = async (): Promise<StoredDevice | null> => {
    let text: string;
    try { text = await readFile(location, 'utf8'); }
    catch (error) {
      if (code(error) === 'ENOENT') return null;
      throw storeUnavailable(error);
    }
    return parseDevice(text);
  };
  return Object.freeze({
    location,
    read,
    async claim(device: StoredDevice): Promise<StoredDevice> {
      verifyDevice(device);
      const temp = `${location}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await mkdir(dir, {recursive: true, mode: 0o700});
        const handle = await open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({schemaVersion: 1, ...device})}\n`);
          await handle.sync();
        } finally { await handle.close(); }
        // link(2) never replaces an existing name, so two clients racing here cannot overwrite each other.
        await link(temp, location);
      } catch (error) {
        if (code(error) !== 'EEXIST') throw error instanceof CoreError ? error : storeUnavailable(error);
      } finally {
        // Best effort: a temp left behind is inert and visible next to device.json; it must not fail a successful claim.
        await unlink(temp).catch(() => undefined);
      }
      const winner = await read();
      if (winner === null) throw storeUnavailable({code: 'ENOENT'});
      return winner;
    },
  });
}
