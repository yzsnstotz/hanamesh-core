// Serve an exact test bundle and a directory entry from an isolated loopback origin.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.env.MCL1_ROOT;
assert.ok(root);
const fixture=join(root,'fixture');
const appId='market-runtime-fixture';
const name='@hanamesh/app-'+appId;
const displayName='Market runtime fixture';
const version='1.0.0';
const hanaId='28c2a4b5-62e2-496b-8e7b-a3b523b15e81';
const runtime='fixture-runtime';
const asset='runtime.tgz';
const packageDir=join(fixture,'package');
const runtimeDir=join(fixture,'runtime');
await mkdir(join(runtimeDir,'bin'),{recursive:true});
await mkdir(packageDir,{recursive:true});
await writeFile(join(runtimeDir,'bin','app'),'#!/bin/sh\nexit 0\n',{mode:0o755});
execFileSync('/usr/bin/tar',['-czf',join(fixture,asset),'-C',runtimeDir,'bin']);
const sha256=createHash('sha256').update(await readFile(join(fixture,asset))).digest('hex');
const manifest={name,version,type:'module',main:'./dsh.js',engines:{dsh:'>=0.2.2-rc.1 <0.3.0-0'},
  dsh:{bundle:{patch:'./cordis.patch.yml'}},hanamesh:{app:'./app.json',contractVersion:1}};
const item={hanaId,displayName,categories:['hanamesh-app'],channels:['dsh'],sourceLinks:[],publisher:{name:'Fixture'},
  summary:{en:'Runtime installation fixture'},oneClickInstall:{allowed:true,reason:null},
  installMethods:[{channel:'dsh',kind:'npm',spec:name+'@'+version,command:'dsh plugin add '+name+'@'+version,
    target:{source:'npm',name,version,allowBuild:[]}}]};
const deployment={id:'local',dataId:'data-v1',mode:'owned',args:['{{dataDir}}','{{port}}'],env:{},envAllowlist:[],
  readiness:{path:'/',status:200,bodyIncludes:appId},runtime:{item:runtime,exec:'bin/app',manifest:{
    schema:1,sources:[{id:'fixture',kind:'file',base:pathToFileURL(fixture+'/').href}],items:[{
      id:runtime,version,kind:'tar.gz',installTo:'runtime',platforms:{[process.platform+'-'+process.arch]:{asset,sha256}},
    }],
  }}};
const json=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
await json(join(packageDir,'package.json'),manifest);
await json(join(packageDir,'app.json'),{id:appId,name:displayName,deployments:[deployment]});
await writeFile(join(packageDir,'cordis.patch.yml'),`- insert:\n  - id: ${appId}\n    name: '${name}'\n    config: {}\n`);
await writeFile(join(packageDir,'dsh.js'),`import {readFile} from 'node:fs/promises';
export const inject=['hanameshApps'];
export async function apply(ctx){
  ctx.hanameshApps.register(JSON.parse(await readFile(new URL('./app.json',import.meta.url),'utf8')));
}
`);
const [{filename}]=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',fixture],{cwd:packageDir,encoding:'utf8'}));
const tarball=await readFile(join(fixture,filename));
const hash=(alg,encoding)=>createHash(alg).update(tarball).digest(encoding);
const published='2025-01-01T00:00:00.000Z';
// pnpm checks release dates for the already locked public packages when changing registries.
const lock=await readFile(join(root,'dsh','profiles','desktop','pnpm-lock.yaml'),'utf8');
const existing=new Set(Array.from(lock.matchAll(/^  ['"]?((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)@[^\n]+:$/gm),row=>row[1]));
const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const exact={...manifest,dist:{tarball:origin+'/bundle.tgz',shasum:hash('sha1','hex'),integrity:'sha512-'+hash('sha512','base64')}};
  if(req.method==='GET'&&path==='/bundle.tgz'){
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':tarball.length});
    res.end(tarball);
    return;
  }
  const responses={
    ['/api/v2/hanas']:{items:[item],page:1,totalPages:1,total:1,facets:{}},
    ['/api/v2/hanas/'+hanaId]:item,
    ['/'+name]:{name,versions:{[version]:exact},'dist-tags':{latest:version},time:{created:published,modified:published,[version]:published}},
    ['/'+name+'/'+version]:exact,
  };
  const value=req.method==='GET'?responses[path]:undefined;
  const lockedPackage=path.slice(1);
  if(!value&&req.method==='GET'&&existing.has(lockedPackage)){
    try{
      const upstream=await fetch('https://registry.npmjs.org/'+encodeURIComponent(lockedPackage),{
        credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000),
      });
      const body=Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status,{'Content-Type':'application/json'});
      res.end(body);
      return;
    }catch{
      res.writeHead(502,{'Content-Type':'application/json'});
      res.end(JSON.stringify({error:{code:'FIXTURE_METADATA_UNAVAILABLE'}}));
      return;
    }
  }
  res.writeHead(value?200:404,{'Content-Type':'application/json'});
  res.end(JSON.stringify(value??{error:{code:'FIXTURE_ROUTE_NOT_FOUND'}}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
await json(join(root,'fixture.json'),{pid:process.pid,origin,appId,name,displayName,version,hanaId,runtime,sha256});
