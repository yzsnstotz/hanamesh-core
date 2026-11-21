import test from 'node:test';
import assert from 'node:assert/strict';
import {loadClient,settle} from './fixtures/client-loader.mjs';

// Exercise the normal Loader entry, with public root declarations already supplied
// by DSH/Core. No source-text assertions, host/profile mutation, or installation.
async function activated(t) {
  const calls=[],entries=[],cleanups=[];const scope={fetch:async(path,init)=>{calls.push({path,method:init?.method??'GET'});return Response.json({});}};const h={module:await loadClient({scope}),unmount(){}};
  const slots={
    inject(_slot,run){return run();},
    register(options,component){const row={options,component};entries.push(row);return()=>{row.released=true;};},
  };
  const ctx={slots,layout:{selectPanel(){}},effect(run){const stop=run();if(typeof stop==='function')cleanups.push(stop);},
    inject(_services,run){return run(ctx);},provide(){return()=>{};},reflect:{get(){return undefined;}}};
  t.after(()=>{for(const stop of cleanups.reverse())stop();h.unmount();});
  h.module.apply(ctx);await settle();
  return{h,calls,entries};
}

test('CL6 B registers HanaMesh beside the DSH Installed/Discover tabs through plugins.tab',async t=>{
  const{entries}=await activated(t);
  assert(entries.some(row=>row.options.name==='plugins.tab'&&row.options.id==='hanamesh'&&row.options.label==='HanaMesh'),
    'normal Market activation must contribute the HanaMesh plugins.tab entry');
});

test('CL6 B retires the AppHost library sidebar/main/footer/market-overlay registrations',async t=>{
  const{entries}=await activated(t);
  const retired=entries.filter(({options:o})=>
    (o.name==='sidebar.panellist'&&o.id==='hanamesh-library')||
    (o.name==='main'&&o.key==='hanamesh-library')||
    (o.name==='sidebar.footer.action'&&o.id==='hanamesh-library')||
    (o.name==='shell.overlay'&&o.id==='hanamesh-library-overlay'));
  assert.deepEqual(retired.map(row=>[row.options.name,row.options.id??row.options.key]),[],
    'the market moves to the native Plugins tab; old entry points must not stay registered');
});

test('CL6 B activation never reads a second installed-plugin list to claim the retired market seat',async t=>{
  const{calls}=await activated(t);
  assert.equal(calls.some(row=>row.path==='/hanamesh/library/installedPlugins'),false,
    'DSH owns installed state; legacy dshmarket seat arbitration must disappear');
});
