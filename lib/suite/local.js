import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inspectPackage } from '../health/loader.js';
import { CORE_DEFAULTS } from '../validation.js';
import { isPackageName } from './facts.js';
/** Reads public package metadata only; resolving an entry never executes its module. */
export async function packageMetadata(name, baseUrl, entry = name, maxResponseBytes = CORE_DEFAULTS.maxResponseBytes) {
    try {
        if (!isPackageName(name) || (entry !== name && entry !== `${name}/dsh`))
            return null;
        const require = createRequire(baseUrl);
        let path;
        try {
            path = require.resolve(`${name}/package.json`);
        }
        catch {
            let cursor = dirname(require.resolve(entry));
            for (;;) {
                const candidate = join(cursor, 'package.json');
                try {
                    if ((await stat(candidate)).size <= maxResponseBytes && JSON.parse(await readFile(candidate, 'utf8')).name === name) {
                        path = candidate;
                        break;
                    }
                }
                catch { /* a parent may contain the package's public metadata */ }
                const parent = dirname(cursor);
                if (parent === cursor)
                    break;
                cursor = parent;
            }
        }
        if (!path || (await stat(path)).size > maxResponseBytes)
            return null;
        const value = JSON.parse(await readFile(path, 'utf8'));
        return value.name === name && typeof value.version === 'string' ? value : null;
    }
    catch {
        return null;
    }
}
export function suiteInspector(maxResponseBytes = CORE_DEFAULTS.maxResponseBytes) {
    return async (name, baseUrl, entry = name) => {
        const observed = await inspectPackage(name, baseUrl, entry);
        const metadata = await packageMetadata(name, baseUrl, entry, maxResponseBytes);
        return { ...observed, ...(metadata ? { repository: metadata.repository, metadata } : {}) };
    };
}
