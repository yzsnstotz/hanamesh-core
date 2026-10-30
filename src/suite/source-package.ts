import {createServer} from 'node:http';
import type {Socket} from 'node:net';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Parser} from 'tar';
import semver from 'semver';
import {CoreError} from '../errors.js';
import {SUITE_MANIFEST} from './index.js';
import {isPackageName, registryUrl, repositoryIdentity} from './facts.js';

export interface SuitePackageSourceOptions {
  readonly archives: readonly {readonly path: string; readonly integrity: string}[];
  readonly port: number;
  readonly peerRegistry: string;
  readonly maxArchiveBytes: number;
  readonly maxExpandedBytes: number;
  readonly maxEntries: number;
  readonly maxManifestBytes: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}
export interface SuitePackageSource {readonly registry: string; close(): Promise<void>}
function fail(code: string): never {throw new CoreError(code, 502);}

async function archive(path: string, expected: string, options: SuitePackageSourceOptions): Promise<{bytes: Buffer; metadata: Record<string, unknown>}> {
  if (typeof path !== 'string' || !path || typeof expected !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(expected)) fail('CORE_SUITE_ARCHIVE_INPUT');
  const file = await open(path, 'r').catch(() => fail('CORE_SUITE_ARCHIVE_READ'));
  let bytes: Buffer;
  try {
    const size = (await file.stat()).size;
    if (size > options.maxArchiveBytes) fail('CORE_SUITE_ARCHIVE_LIMIT');
    bytes = Buffer.alloc(size + 1);
    let used = 0;
    while (used < bytes.length) {
      const result = await file.read(bytes, used, bytes.length - used, null);
      if (!result.bytesRead) break;
      used += result.bytesRead;
    }
    if (used > size) fail('CORE_SUITE_ARCHIVE_CHANGED');
    bytes = bytes.subarray(0, used);
  } finally {await file.close();}
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== expected) fail('CORE_SUITE_ARCHIVE_INTEGRITY');
  let expanded: Buffer;
  try {expanded = gunzipSync(bytes, {maxOutputLength: options.maxExpandedBytes});}
  catch (error) {fail((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' ? 'CORE_SUITE_ARCHIVE_EXPANDED_LIMIT' : 'CORE_SUITE_ARCHIVE_INVALID');}
  if (expanded.length < 1024 || expanded.length % 512 || expanded.subarray(-1024).some(byte => byte !== 0)) fail('CORE_SUITE_ARCHIVE_INVALID');
  let metadata: Record<string, unknown> | undefined, count = 0, manifestSeen = false;
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({strict: true, maxMetaEntrySize: options.maxManifestBytes});
    const countEntry = (): void => {if (++count > options.maxEntries) throw new CoreError('CORE_SUITE_ARCHIVE_ENTRY_LIMIT');};
    parser.on('error', reject);
    parser.on('end', resolve);
    parser.on('meta', () => {try {countEntry();} catch (error) {parser.abort(error as Error);}});
    parser.on('entry', entry => {
      try {
        countEntry();
        if (entry.path !== 'package/package.json') {entry.resume(); return;}
        if (manifestSeen || entry.type !== 'File') fail('CORE_SUITE_ARCHIVE_MANIFEST_INVALID');
        manifestSeen = true;
        if (entry.size > options.maxManifestBytes) fail('CORE_SUITE_ARCHIVE_MANIFEST_LIMIT');
        const chunks: Buffer[] = []; let size = 0;
        entry.on('data', (chunk: Buffer) => {size += chunk.length; if (size > options.maxManifestBytes) parser.abort(new CoreError('CORE_SUITE_ARCHIVE_MANIFEST_LIMIT')); else chunks.push(chunk);});
        entry.on('end', () => {
          try {
            const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CORE_SUITE_ARCHIVE_MANIFEST_INVALID');
            metadata = value as Record<string, unknown>;
          } catch (error) {parser.abort(error instanceof CoreError ? error : new CoreError('CORE_SUITE_ARCHIVE_MANIFEST_INVALID'));}
        });
        entry.resume();
      } catch (error) {parser.abort(error as Error);}
    });
    parser.end(expanded);
  }).catch(error => {if (error instanceof CoreError) throw error; fail('CORE_SUITE_ARCHIVE_INVALID');});
  if (!metadata) fail('CORE_SUITE_ARCHIVE_MANIFEST_INVALID');
  return {bytes, metadata};
}

/** Read-only, explicitly owned loopback npm source backed by normal SRI-verified package archives. */
export async function createSuitePackageSource(options: SuitePackageSourceOptions): Promise<SuitePackageSource> {
  if (!options || !Array.isArray(options.archives) || !Number.isInteger(options.port) || options.port < 0 || options.port > 65535 || ![options.maxArchiveBytes, options.maxExpandedBytes, options.maxEntries, options.maxManifestBytes, options.maxResponseBytes, options.timeoutMs].every(n => Number.isSafeInteger(n) && n > 0) || options.timeoutMs > 2_147_483_647) throw new CoreError('CORE_INPUT_INVALID', 400);
  const peerRegistry = registryUrl(options.peerRegistry);
  const members = [SUITE_MANIFEST.core, ...SUITE_MANIFEST.components.map(row => ({name: row.moduleName, repository: row.repository}))];
  const records = new Map<string, Map<string, {bytes: Buffer; metadata: Record<string, unknown>; integrity: string}>>();
  for (const item of options.archives) {
    const value = await archive(item?.path, item?.integrity, options);
    const {name, version, repository} = value.metadata;
    const member = members.find(row => row.name === name);
    if (!member || typeof version !== 'string' || !semver.valid(version) || repositoryIdentity(repository) !== repositoryIdentity(member.repository)) fail('CORE_SUITE_ARCHIVE_MEMBERS');
    if (!records.has(member.name)) records.set(member.name, new Map());
    const versions = records.get(member.name)!;
    if (versions.has(version)) fail('CORE_SUITE_ARCHIVE_DUPLICATE');
    versions.set(version, {...value, integrity: item.integrity});
  }
  if (members.some(row => !records.has(row.name))) fail('CORE_SUITE_ARCHIVE_MEMBERS');
  const sockets = new Set<Socket>(), pending = new Set<AbortController>();
  let registry = '', closed = false;
  const server = createServer((request, response) => {
    const error = (status: number, code: string): void => {if (!response.destroyed) {response.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'}); response.end(JSON.stringify({error: {code}}));}};
    void (async () => {
      if (request.headers.host !== new URL(registry).host || request.headers.authorization || request.headers.cookie) {error(403, 'CORE_SUITE_SOURCE_AUTHORITY'); return;}
      if (request.method !== 'GET' && request.method !== 'HEAD') {error(405, 'CORE_SUITE_SOURCE_READ_ONLY'); return;}
      const target = new URL(request.url ?? '/', registry);
      if (target.origin !== new URL(registry).origin || target.search || target.hash) {error(400, 'CORE_SUITE_SOURCE_UNSUPPORTED'); return;}
      if (target.pathname.startsWith('/archives/')) {
        const id = target.pathname.slice('/archives/'.length);
        const record = [...records.values()].flatMap(versions => [...versions.values()]).find(row => createHash('sha512').update(row.bytes).digest('hex') + '.tgz' === id);
        if (!record) {error(404, 'CORE_SUITE_ARCHIVE_NOT_FOUND'); return;}
        response.writeHead(200, {'content-type': 'application/octet-stream', 'content-length': record.bytes.length, 'cache-control': 'no-store'});
        response.end(request.method === 'HEAD' ? undefined : record.bytes); return;
      }
      let name: string;
      try {name = decodeURIComponent(target.pathname.slice(1));} catch {error(400, 'CORE_SUITE_SOURCE_UNSUPPORTED'); return;}
      if (!isPackageName(name)) {error(400, 'CORE_SUITE_SOURCE_UNSUPPORTED'); return;}
      let body: Buffer;
      if (records.has(name)) {
        const versions = Object.fromEntries([...records.get(name)!].map(([version, row]) => [version, {...row.metadata, dist: {integrity: row.integrity, tarball: `${registry}archives/${createHash('sha512').update(row.bytes).digest('hex')}.tgz`}}]));
        body = Buffer.from(JSON.stringify({name, 'dist-tags': {}, versions}));
        if (body.length > options.maxResponseBytes) fail('CORE_SUITE_METADATA_LIMIT');
      } else {
        const abort = new AbortController(); pending.add(abort);
        let timedOut = false;
        const timer = setTimeout(() => {timedOut = true; abort.abort();}, options.timeoutMs);
        const disconnected = (): void => {if (!response.writableEnded) abort.abort();};
        response.once('close', disconnected);
        try {
          const url = new URL(encodeURIComponent(name), peerRegistry);
          const upstream = await fetch(url, {headers: {accept: 'application/json'}, redirect: 'manual', signal: abort.signal});
          if (upstream.status >= 300 && upstream.status < 400 || upstream.url !== url.href) {await upstream.body?.cancel(); fail('CORE_SUITE_SOURCE_MISMATCH');}
          if (!upstream.ok) {await upstream.body?.cancel(); error(upstream.status, 'CORE_SUITE_PEER_METADATA_HTTP_ERROR'); return;}
          const chunks: Uint8Array[] = []; let size = 0;
          if (!upstream.body) fail('CORE_SUITE_METADATA_INVALID');
          const reader = upstream.body.getReader();
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.length;
            if (size > options.maxResponseBytes) {await reader.cancel(); fail('CORE_SUITE_METADATA_LIMIT');}
            chunks.push(chunk.value);
          }
          body = Buffer.concat(chunks);
          let value: unknown;
          try {value = JSON.parse(body.toString('utf8'));} catch {fail('CORE_SUITE_METADATA_INVALID');}
          if (!value || typeof value !== 'object' || (value as {name?: unknown}).name !== name || !(value as {versions?: unknown}).versions) fail('CORE_SUITE_SOURCE_MISMATCH');
        } catch (cause) {
          abort.abort();
          if (cause instanceof CoreError) throw cause;
          throw new CoreError(closed ? 'CORE_DISPOSED' : timedOut ? 'CORE_SUITE_PEER_METADATA_TIMEOUT' : 'CORE_SUITE_PEER_METADATA_TRANSPORT_FAILED', 502);
        } finally {clearTimeout(timer); pending.delete(abort); response.removeListener('close', disconnected);}
      }
      response.writeHead(200, {'content-type': 'application/json', 'content-length': body.length, 'cache-control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : body);
    })().catch(cause => error(cause instanceof CoreError ? cause.status : 500, cause instanceof CoreError ? cause.code : 'CORE_SUITE_SOURCE_FAILED'));
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(options.port, '127.0.0.1', () => {server.removeListener('error', reject); resolve();});});
  const address = server.address();
  if (!address || typeof address === 'string') {server.close(); fail('CORE_SUITE_SOURCE_LISTEN_FAILED');}
  registry = `http://127.0.0.1:${address.port}/`;
  let closing: Promise<void> | undefined;
  return {registry, close: () => closing ??= new Promise<void>((resolve, reject) => {
    closed = true; for (const abort of pending) abort.abort();
    server.close(error => error ? reject(error) : resolve());
    for (const socket of sockets) socket.destroy();
  })};
}
