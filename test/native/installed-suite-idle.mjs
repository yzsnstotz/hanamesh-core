/** Observe an already isolated installed Desktop through its public status port, including the native idle timeout window. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
const [listener,website,evidence]=process.argv.slice(2);
assert.match(listener??'',/^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(website).origin,website);
assert.ok(isAbsolute(evidence??''),'Use a new absolute evidence directory.');
await mkdir(evidence,{recursive:false});
const core=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
const bundle=JSON.parse(await readFile(new URL('../../packages/hanamesh/package.json',import.meta.url),'utf8'));
const startedAt=Date.now();
async function observe(name){
 const response=await fetch(listener+'/hanamesh/library/installation-status',{method:'POST',headers:{origin:website,'content-type':'application/json'},body:JSON.stringify({contractVersion:'1',consent:'read-installations'}),signal:AbortSignal.timeout(10000)});
 const body=await response.json();
 await writeFile(join(evidence,name+'.json'),JSON.stringify({elapsedMs:Date.now()-startedAt,status:response.status,body},null,2)+'\n');
 assert.equal(response.status,200);
 const current=body.observations.find(row=>row.scope.id==='current-runtime');
 assert.equal(current.status,'installed','the installed suite must remain observable through its real client peer lease');
 assert.equal(current.version,bundle.version);
 assert.equal(current.components.find(row=>row.name===core.name)?.version,core.version);
 assert.ok(current.components.every(row=>row.status==='satisfied'));
 return body;
}
const before=await observe('before');
console.log('Initial installed suite confirmed; observing the unchanged native carrier for 330000 ms.');
await new Promise(resolve=>setTimeout(resolve,330000));
const after=await observe('after');
assert.notEqual(after.checkedAt,before.checkedAt,'the second read must be fresh');
await writeFile(join(evidence,'result.json'),JSON.stringify({result:'PASS',elapsedMs:Date.now()-startedAt,core:core.version,bundle:bundle.version})+'\n');
console.log('PASS: installed suite and versions survived the native idle timeout window.');
