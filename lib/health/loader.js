import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const phase = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: 'disabled', 5: 'unloading' };
function safeStartupFailure(error) {
    try {
        if (!error || typeof error !== 'object')
            return { code: 'startup-failed' };
        const { name, code, message } = error;
        if (name === 'DomainError' && code === 'invalid-record') {
            // DomainError has no structured domain field. Match one finite public prefix;
            // never retain prose, record locations, causes, stacks, or arbitrary domains.
            return typeof message === 'string' && message.startsWith("domain 'hanamesh_usage_events':")
                ? { code: 'invalid-record', domain: 'hanamesh_usage_events' } : { code: 'invalid-record' };
        }
        if (name === 'StorageError' && (code === 'version-mismatch' || code === 'backend-not-found' || code === 'malformed-medium'))
            return { code };
        if (name === 'ValidationError' || (name === 'UsageError' && code === 'INVALID_CONFIG'))
            return { code: 'invalid-config' };
    }
    catch { /* hostile fields must not break inventory or expose their errors */ }
    return { code: 'startup-failed' };
}
async function startupFailure(fiber, timeoutMs) {
    let timer;
    try {
        if (typeof fiber?.await !== 'function')
            return { code: 'startup-failed' };
        const settled = Promise.resolve().then(() => fiber.await()).then(() => ({ code: 'startup-failed' }), safeStartupFailure);
        return await Promise.race([settled, new Promise(resolve => {
                timer = setTimeout(() => resolve({ code: 'diagnostic-timeout' }), timeoutMs);
            })]);
    }
    catch {
        return { code: 'startup-failed' };
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
export async function inspectPackage(moduleName, baseUrl, entrySpecifier = moduleName) {
    try {
        const require = createRequire(baseUrl);
        let packagePath;
        try {
            packagePath = require.resolve(`${moduleName}/package.json`);
        }
        catch {
            try {
                let cursor = dirname(require.resolve(entrySpecifier));
                for (let index = 0; index < 32; index++) {
                    const candidate = join(cursor, 'package.json');
                    try {
                        if (JSON.parse(await readFile(candidate, 'utf8')).name === moduleName) {
                            packagePath = candidate;
                            break;
                        }
                    }
                    catch { /* continue upward */ }
                    const parent = dirname(cursor);
                    if (parent === cursor)
                        break;
                    cursor = parent;
                }
            }
            catch {
                return { kind: 'missing' };
            }
        }
        if (!packagePath)
            return { kind: 'missing' };
        if ((await stat(packagePath)).size > 256 * 1024)
            return { kind: 'unreadable' };
        const metadata = JSON.parse(await readFile(packagePath, 'utf8'));
        if (metadata.name !== moduleName || typeof metadata.version !== 'string')
            return { kind: 'unreadable' };
        try {
            require.resolve(entrySpecifier);
        }
        catch {
            return { kind: 'damaged', version: metadata.version };
        }
        return { kind: 'present', version: metadata.version };
    }
    catch {
        return { kind: 'unreadable' };
    }
}
export class LoaderObservationSource {
    loader;
    baseUrl;
    inspector;
    diagnosticTimeoutMs;
    constructor(loader, baseUrl, inspector = inspectPackage, diagnosticTimeoutMs = 250) {
        this.loader = loader;
        this.baseUrl = baseUrl;
        this.inspector = inspector;
        this.diagnosticTimeoutMs = diagnosticTimeoutMs;
    }
    async observe(requirements) {
        const entries = [...this.loader.entries()].filter(entry => !entry.options.group);
        return Promise.all(requirements.map(async (requirement) => {
            const matches = entries.filter(entry => {
                const nameMatches = entry.options.name === requirement.moduleName || entry.options.name === `${requirement.moduleName}/dsh`;
                const idMatches = !requirement.loaderEntryId || entry.id === requirement.loaderEntryId || entry.id.endsWith(`:${requirement.loaderEntryId}`);
                return nameMatches && idMatches;
            });
            if (matches.length === 0)
                return { kind: 'missing' };
            if (matches.length > 1)
                return { kind: 'ambiguous' };
            const entry = matches[0];
            const observed = await this.inspector(requirement.moduleName, entry.parent?.tree?.ctx?.baseUrl ?? this.baseUrl, entry.options.name ?? requirement.moduleName);
            const observedPhase = entry.disabled ? 'disabled' : phase[entry.fiber?.state ?? 0] ?? 'pending';
            const diagnostic = observedPhase === 'failed'
                ? { startupFailure: await startupFailure(entry.fiber, Number.isFinite(this.diagnosticTimeoutMs) ? Math.min(1000, Math.max(1, this.diagnosticTimeoutMs)) : 250) } : {};
            return { ...observed, kind: observed.kind === 'missing' ? 'damaged' : observed.kind, phase: observedPhase, ...diagnostic };
        }));
    }
}
