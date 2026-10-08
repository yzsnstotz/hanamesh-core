// Diagnostic only: run Usage's own Core stand-in (read-only export of e4334d5) through the provider suite.
import {runCoreProviderSuite} from 'hanamesh-core/contract/suite';
const {apply} = await import(process.argv[2]);
let service, consentRoute; const effects = [];
const ctx = {provide: (name, value) => { service = value; return async () => {}; }, connection: {fetch: {register: r => { consentRoute = r; return async () => {}; }}}, effect: f => effects.push(f)};
apply(ctx, {serverOrigin: null});
const setConsent = state => consentRoute.fetch(new Request('http://x' + consentRoute.path, {method: 'POST', body: JSON.stringify({state})}));
const result = await runCoreProviderSuite({label: 'hanamesh-usage e4334d5 test/fixtures/core-standin', service, setConsent});
console.log(JSON.stringify({ok: result.ok, failed: result.results.filter(r => !r.ok)}));
