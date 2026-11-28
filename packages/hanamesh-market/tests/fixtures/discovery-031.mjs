import {readFile} from 'node:fs/promises';

export async function legacyDiscoveryFixture(name) {
  return JSON.parse(await readFile(new URL('./discovery-027/'+name+'.json',import.meta.url),'utf8'));
}

export function localizeDiscoveryFixture(fixture) {
  const value=structuredClone(fixture);
  const localized=text=>typeof text==='string'?{byLocale:{zh:text}}:{byLocale:text};
  function visit(node) {
    if (!node||typeof node!=='object')return;
    // Project the frozen 0.27.0 evidence onto the current test wire shape.
    delete node.hiddenInsufficientCount;
    delete node.hiddenInsufficientCountCapped;
    if (node.overview?.does)node.overview.does=localized(node.overview.does);
    for (const key of ['audience','difficultyReason']) {
      const fact=node.overview?.facts?.[key];
      if (fact?.value)fact.value=localized(fact.value);
    }
    if (Array.isArray(node.reasons))for (const reason of node.reasons)reason.text=localized(reason.text);
    for (const group of [node.domains,node.subdivisions]) {
      if (!Array.isArray(group))continue;
      for (const row of group)if(typeof row.name==='string')row.name=localized(row.name);
    }
    for (const child of Object.values(node))visit(child);
  }
  visit(value);
  return value;
}

export async function discoveryFixture(name) {
  return localizeDiscoveryFixture(await legacyDiscoveryFixture(name));
}
