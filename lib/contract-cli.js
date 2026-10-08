#!/usr/bin/env node
/**
 * hanamesh-core-contract-suite — runs the v1 contract suite from the installed package.
 *   hanamesh-core-contract-suite                              provider suite on the real Core provider and the provider fixture,
 *                                                             consumer suite on the reference consumer fixture
 *   hanamesh-core-contract-suite --consumer <file.js>#<export>  also run the consumer suite on your acceptance function
 *   hanamesh-core-contract-suite --provider core|fixture       only that provider
 * Prints one JSON line per suite plus a summary line; exit 1 if any check fails.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CORE_FIXTURE_LABEL, createCoreConsumerFixture, createCoreProviderFixture } from './contract-fixtures.js';
import { runCoreConsumerSuite, runCoreProviderSuite } from './contract-suite.js';
import { SessionController } from './controller.js';
import { INITIAL_CORE_SNAPSHOT } from './contracts.js';
const args = process.argv.slice(2);
const values = (flag) => args.flatMap((arg, index) => arg === flag && args[index + 1] ? [args[index + 1]] : []);
const providers = values('--provider');
const wantProvider = (name) => providers.length === 0 || providers.includes(name);
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const results = [];
if (wantProvider('core')) {
    // The product provider object (`controller.service` is what `ctx.provide('hanameshCore', …)` publishes), on an in-memory store, offline.
    let value = structuredClone(INITIAL_CORE_SNAPSHOT);
    const controller = await SessionController.create({ serverOrigin: null, websiteOrigin: null }, { read: () => value, publish: async (next) => { value = next; }, close: async () => undefined });
    try {
        results.push(await runCoreProviderSuite({ label: `${packageInfo.name}@${packageInfo.version} SessionController.service (in-memory store, offline)`, service: controller.service, setConsent: state => controller.setConsent(state) }));
    }
    finally {
        await controller.dispose();
    }
}
if (wantProvider('fixture'))
    results.push(await runCoreProviderSuite(createCoreProviderFixture()));
results.push(await runCoreConsumerSuite(createCoreConsumerFixture()));
for (const spec of values('--consumer')) {
    const [file, exportName = 'default'] = spec.split('#');
    const module = await import(pathToFileURL(resolve(file)).href);
    const accept = module[exportName];
    if (typeof accept !== 'function')
        throw new Error(`CONSUMER_EXPORT_NOT_FUNCTION: ${spec}`);
    results.push(await runCoreConsumerSuite({ label: spec, accept: accept }));
}
for (const result of results)
    console.log(JSON.stringify(result));
const failed = results.flatMap(result => result.results.filter(item => !item.ok).map(item => `${result.side}:${result.subject}:${item.id}`));
console.log(JSON.stringify({ event: 'hanamesh_core_contract_suite', package: `${packageInfo.name}@${packageInfo.version}`, protocolVersion: '1', fixtureLabel: CORE_FIXTURE_LABEL,
    suites: results.map(result => ({ side: result.side, subject: result.subject, ok: result.ok, checks: result.results.length })), failed, ok: failed.length === 0 }));
process.exitCode = failed.length === 0 ? 0 : 1;
