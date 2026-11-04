import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,isAbsolute,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import yaml from 'js-yaml';

export const components=[['core','@hanamesh/core'],['usage','@hanamesh/usage'],['appHost','@hanamesh/dsh-app-host']];
const exactVersion=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function command(file,args,options={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(file,args,{shell:false,...options,stdio:['ignore','pipe','pipe']});const out=[],err=[];
  child.stdout.on('data',chunk=>out.push(chunk));child.stderr.on('data',chunk=>err.push(chunk));
  child.once('error',reject);child.once('close',code=>code===0?resolve(Buffer.concat(out).toString('utf8')):reject(Error(`${file} exited ${code}: ${Buffer.concat(err).toString('utf8').trim()}`)));
 });
}
function archivePath(value){
 if(typeof value!=='string'||!value||/[\x00-\x1f\x7f\\]/.test(value)||posix.isAbsolute(value)||value.split('/').includes('..'))throw Error('BUNDLE_PATCH_PATH_INVALID');
 return 'package/'+value.replace(/^\.\//,'');
}
export async function readBundle(file,name,version){
 const listing=(await command('tar',['-tzf',file],{env:{...process.env,LC_ALL:'C'}})).trimEnd().split('\n');
 if(listing.some(path=>!path.startsWith('package/')||path.split('/').includes('..')||/[\x00-\x1f\x7f\\]/.test(path))||new Set(listing).size!==listing.length)throw Error('SOURCE_ARCHIVE_PATH_INVALID');
 const read=async path=>{if(!listing.includes(path))throw Error(`SOURCE_FILE_MISSING: ${path}`);return command('tar',['-xOzf',file,path],{env:{...process.env,LC_ALL:'C'}});};
 const pkg=JSON.parse(await read('package/package.json'));
 if(pkg.name!==name||pkg.version!==version)throw Error(`SOURCE_IDENTITY_MISMATCH: ${name}@${version}`);
 const declared=pkg.dsh?.bundle?.patch,paths=typeof declared==='string'?[declared]:declared;
 if(!Array.isArray(paths)||!paths.length)throw Error(`SOURCE_NOT_BUNDLE: ${name}`);
 const patch=[];
 for(const path of paths){const rows=yaml.load(await read(archivePath(path)));if(!Array.isArray(rows)||!rows.length)throw Error('SOURCE_PATCH_INVALID');patch.push(...rows);}
 return {pkg,patch,sha256:digest(await readFile(file))};
}
export function mergeBundles(version,sources){
 if(!exactVersion.test(version)||sources.length!==components.length)throw Error('RELEASE_INPUT_INVALID');
 const dependencies={},peerDependencies={},optional=new Map(),patch=[],ids=new Set();
 for(const [index,{pkg,patch:rows}] of sources.entries()){
  if(pkg.name!==components[index][1]||!exactVersion.test(pkg.version))throw Error('SOURCE_ORDER_OR_VERSION_INVALID');
  dependencies[pkg.name]=pkg.version;
  if(!record(pkg.peerDependencies))throw Error(`SOURCE_PEERS_MISSING: ${pkg.name}`);
  for(const [name,range] of Object.entries(pkg.peerDependencies)){
   if(typeof range!=='string'||!range.trim())throw Error(`SOURCE_PEER_INVALID: ${name}`);
   // Preserve the providers' shared declaration. Differing declarations need review, never a guessed range.
   if(peerDependencies[name]!==undefined&&peerDependencies[name]!==range)throw Error(`PEER_DECLARATIONS_DIFFER: ${name}: ${peerDependencies[name]} / ${range}`);
   peerDependencies[name]=range;optional.set(name,(optional.get(name)??true)&&pkg.peerDependenciesMeta?.[name]?.optional===true);
  }
  for(const row of rows){
   if(!record(row)||Object.keys(row).length!==1||!Array.isArray(row.insert)||!row.insert.length)throw Error('SOURCE_PATCH_OPERATION_UNSUPPORTED');
   for(const entry of row.insert){
    if(!record(entry)||typeof entry.id!=='string'||!entry.id||ids.has(entry.id))throw Error('SOURCE_ENTRY_ID_INVALID_OR_DUPLICATE');
    if(typeof entry.name!=='string'||!(entry.name===pkg.name||entry.name.startsWith(pkg.name+'/'))||entry.name.split('/').includes('..'))throw Error('SOURCE_ENTRY_MUST_USE_PACKAGE_NAME');
    ids.add(entry.id);
   }
   patch.push(structuredClone(row));
  }
 }
 const peers=Object.fromEntries(Object.entries(peerDependencies).sort(([a],[b])=>a.localeCompare(b))),peerDependenciesMeta=Object.fromEntries([...optional].filter(([,value])=>value).map(([name])=>[name,{optional:true}]));
 if(!Object.keys(peers).length)throw Error('SOURCE_PEERS_MISSING');
 return {manifest:{name:'@hanamesh/hanamesh',version,description:'HanaMesh Core, Usage and AppHost for DSH in one installation.',license:'MIT',repository:{type:'git',url:'https://github.com/yzsnstotz/hanamesh-core.git',directory:'packages/hanamesh'},exports:{'./package.json':'./package.json'},files:['cordis.patch.yml','release.json','LICENSE'],dependencies,peerDependencies:peers,...(Object.keys(peerDependenciesMeta).length?{peerDependenciesMeta}:{}),dsh:{bundle:{patch:'./cordis.patch.yml'}},publishConfig:{access:'public'}},patch};
}
export async function buildHanaMesh(input,fetchPackage){
 if(!record(input)||!exactVersion.test(input.version)||!isAbsolute(input.outputDir??'')||components.some(([role])=>!exactVersion.test(input[role]??'')))throw Error('RELEASE_INPUT_REQUIRES_EXACT_VERSIONS_AND_ABSOLUTE_OUTPUT');
 // A fresh directory prevents a failed build from leaving a previous release looking current.
 await mkdir(input.outputDir,{mode:0o700});
 const npmDir=join(input.outputDir,'npm');await mkdir(npmDir);
 const userConfig=join(npmDir,'user.npmrc'),globalConfig=join(npmDir,'global.npmrc');await writeFile(userConfig,'registry=https://registry.npmjs.org/\n');await writeFile(globalConfig,'');
 const env={...process.env,LC_ALL:'C',npm_config_userconfig:userConfig,npm_config_globalconfig:globalConfig,npm_config_cache:join(npmDir,'cache')};
 const fetch=fetchPackage??(async(name,version,destination)=>{
  const result=JSON.parse(await command('npm',['pack',`${name}@${version}`,'--ignore-scripts','--json','--registry=https://registry.npmjs.org','--pack-destination',destination],{env,cwd:npmDir}));
  if(!Array.isArray(result)||result.length!==1||typeof result[0].filename!=='string'||posix.basename(result[0].filename)!==result[0].filename||!result[0].filename.endsWith('.tgz'))throw Error('NPM_PACK_RESULT_INVALID');
  return join(destination,result[0].filename);
 });
 const sources=[];
 for(const [role,name] of components){
  const destination=join(input.outputDir,role);await mkdir(destination);
  const file=await fetch(name,input[role],destination);
  sources.push(await readBundle(file,name,input[role]));
 }
 const {manifest,patch}=mergeBundles(input.version,sources),packageDir=join(input.outputDir,'package');await mkdir(packageDir);
 const release={version:input.version,sources:sources.map(({pkg,sha256})=>({name:pkg.name,version:pkg.version,sha256})),entryIds:patch.flatMap(row=>row.insert.map(entry=>entry.id))};
 await writeFile(join(packageDir,'package.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(packageDir,'cordis.patch.yml'),yaml.dump(patch,{noRefs:true,lineWidth:-1}));await writeFile(join(packageDir,'release.json'),JSON.stringify(release,null,2)+'\n');
 await writeFile(join(packageDir,'README.md'),await readFile(new URL('./README.md',import.meta.url),'utf8'));
 await writeFile(join(packageDir,'LICENSE'),await readFile(new URL('../../LICENSE',import.meta.url),'utf8'));
 const packed=JSON.parse(await command('npm',['pack','--ignore-scripts','--offline','--json','--pack-destination',input.outputDir],{cwd:packageDir,env}));
 if(!Array.isArray(packed)||packed.length!==1||packed[0].name!==manifest.name||packed[0].version!==manifest.version||posix.basename(packed[0].filename)!==packed[0].filename)throw Error('OUTPUT_PACK_INVALID');
 const file=join(input.outputDir,packed[0].filename),sha256=digest(await readFile(file)),result={file,sha256,manifest,release};
 await writeFile(join(input.outputDir,'SHA256SUMS'),sha256+'  '+packed[0].filename+'\n');await writeFile(join(input.outputDir,'result.json'),JSON.stringify(result,null,2)+'\n');return result;
}
export function parseArguments(args){
 const names={'--version':'version','--core':'core','--usage':'usage','--app-host':'appHost','--output':'outputDir'},input={};
 for(let i=0;i<args.length;i+=2){const name=names[args[i]];if(!name||input[name]!==undefined||!args[i+1])throw Error('USAGE: node packages/hanamesh/build.mjs --version 0.1.0 --core 0.3.30 --usage 0.3.0-rc.15 --app-host 0.6.20 --output /absolute/new-directory');input[name]=args[i+1];}
 return input;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{console.log(JSON.stringify(await buildHanaMesh(parseArguments(process.argv.slice(2))),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
