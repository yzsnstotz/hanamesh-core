import {readFile, writeFile, rename} from 'node:fs/promises';
import {createDevice} from '../../lib/device.js';

const [file, kind, gate] = process.argv.slice(2);
const current = JSON.parse(await readFile(file, 'utf8'));
let next;
if (kind === 'device') next = {...current, revision: current.revision + 1, device: createDevice()};
else next = {schemaVersion: 1, profile: {id: 'hanamesh-suite', version: '0.2.0-rc.8', label: 'HanaMesh 套件', digest: 'a'.repeat(64)}, revision: current.revision + 1, checkedAt: new Date().toISOString(), mode: 'normal', components: [], newProtectedOperations: 'resource-check-still-required', runningTaskPolicy: 'unchanged', nextStep: 'ok', persistence: 'durable'};
if (gate === 'before') {
  process.send?.({event: 'before-set'});
  await new Promise(() => undefined);
} else {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(next));
  await rename(temp, file);
  process.send?.({event: 'after-set'});
  await new Promise(() => undefined);
}
