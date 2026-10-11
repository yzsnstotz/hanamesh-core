import test from 'node:test';
import assert from 'node:assert/strict';

const {collectLatestActivity} = await import('../lib/client/index.js');

const at = index => new Date(Date.UTC(2026, 8, 30, 0, 0, index)).toISOString();
const item = index => ({hanaRef: '@hanamesh/app-vibe-trading', action: index % 2 ? 'use' : 'open', occurredAt: at(index)});
const window = {from: '2026-09-29T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z'};

test('bounded scan reaches the tail before declaring newest events and retains only the latest 25', async () => {
  assert.equal(typeof collectLatestActivity, 'function');
  const pages = [
    {status: 'ready', reason: null, items: Array.from({length: 200}, (_, index) => item(index)), nextAfter: 'cursor1', window},
    {status: 'ready', reason: null, items: Array.from({length: 200}, (_, index) => item(index + 200)), nextAfter: 'cursor2', window},
    {status: 'ready', reason: null, items: [item(400)], nextAfter: null, window},
  ];
  const queries = [];
  const result = await collectLatestActivity(async query => { queries.push(query); return pages.shift(); }, null);
  assert.equal(result.scanned, 401);
  assert.equal(result.nextAfter, null);
  assert.equal(result.items.length, 25);
  assert.equal(result.items.at(-1).occurredAt, at(400));
  assert.deepEqual(queries[1], {...window, after: 'cursor1'});
});

test('a five-page budget remains explicitly incomplete and the next scan can finish', async () => {
  assert.equal(typeof collectLatestActivity, 'function');
  let page = 0;
  const fetchPage = async () => {
    page++;
    return {status: 'ready', reason: null, items: Array.from({length: 200}, (_, index) => item((page - 1) * 200 + index)), nextAfter: page < 6 ? `cursor${page}` : null, window};
  };
  const first = await collectLatestActivity(fetchPage, null);
  assert.equal(first.scanned, 1000);
  assert.equal(first.nextAfter, 'cursor5');
  const finished = await collectLatestActivity(fetchPage, first);
  assert.equal(finished.scanned, 1200);
  assert.equal(finished.nextAfter, null);
  assert.equal(finished.items.at(-1).occurredAt, at(1199));
});

test('named scan and display budgets keep cursors opaque and support continuation',async()=>{
 let count=0;const fetchPage=async()=>({status:'ready',reason:null,items:[item(count++)],nextAfter:count<3?`opaque${count}`:null,window});
 const first=await collectLatestActivity(fetchPage,null,{activityPageBudget:1,activityDisplayRows:2});
 assert.equal(first.scanned,1);assert.equal(first.nextAfter,'opaque1');
 const last=await collectLatestActivity(fetchPage,first,{activityPageBudget:3,activityDisplayRows:2});
 assert.equal(last.scanned,3);assert.equal(last.items.length,2);assert.equal(last.nextAfter,null);
 for(const value of [0,-1,NaN])await assert.rejects(collectLatestActivity(fetchPage,null,{activityPageBudget:value,activityDisplayRows:2}));
});
