/** Public package metadata inventory only; never loads a plugin or calculates compatibility. */
import {readFile,stat,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SUITE_PACKAGES} from './suite.js';
const absent=error=>['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ENOENT','ENOTDIR'].includes(error.code);
async function packageFile(resolver,name){
 try{return resolver.resolve(`${name}/package.json`)}catch(error){
  if(!absent(error)&&error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error;
  // Metadata exports and entry health are independent. Public Node search paths
  // also retain pnpm package symlinks when a declared entry is missing.
  for(const directory of resolver.resolve.paths(name)??[]){
   const root=join(directory,name);
   try{if(!(await stat(root)).isDirectory())throw Object.assign(new Error('package root invalid'),{code:'ERR_PACKAGE_METADATA_UNAVAILABLE'})}catch(error){if(absent(error))continue;throw error}
   const file=join(root,'package.json');
   // Resolve the physical metadata location before creating a member resolver:
   // pnpm binds peers beside the real package, not beside its profile symlink.
   try{if(!(await stat(file)).isFile())throw new Error('metadata unavailable');return await realpath(file)}catch{throw Object.assign(new Error('metadata unavailable'),{code:'ERR_PACKAGE_METADATA_UNAVAILABLE'})}
  }
  throw Object.assign(new Error('package absent'),{code:'MODULE_NOT_FOUND'});
 }
}
export async function readLegacyProfileFacts(profileDir,profile){
 const resolver=createRequire(pathToFileURL(join(profileDir,'package.json')));
 const components=await Promise.all(SUITE_PACKAGES.map(async({name:moduleName})=>{
  const selected=Object.hasOwn(profile.dependencies,moduleName)&&Array.isArray(profile.dsh?.profile?.bundles)&&profile.dsh.profile.bundles.includes(moduleName);
  let observation,peers={};
  try{
   const file=await packageFile(resolver,moduleName),metadata=JSON.parse(await readFile(file,'utf8'));
   observation={kind:'present',phase:selected?'active':'disabled',version:metadata.version,metadata};
   try{const entry=resolver.resolve(moduleName);if(!(await stat(entry)).isFile())observation.kind='damaged'}catch{observation.kind='damaged'}
   const memberResolver=createRequire(pathToFileURL(file));
   if(metadata.peerDependencies&&typeof metadata.peerDependencies==='object'&&!Array.isArray(metadata.peerDependencies))for(const name of Object.keys(metadata.peerDependencies)){
    if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name)||name.length>214)continue;
    try{const pkg=JSON.parse(await readFile(await packageFile(memberResolver,name),'utf8'));peers[name]=pkg.name===name&&typeof pkg.version==='string'?pkg.version:'unknown'}catch(error){peers[name]=absent(error)?null:'unknown'}
   }
  }catch(error){observation={kind:absent(error)?'missing':error instanceof SyntaxError?'present':'unreadable',phase:selected?'active':'disabled'}}
  return{moduleName,observation,peers};
 }));
 // Profile selection/metadata only. No runtime Node or host-injected peer readiness is asserted.
 return{scope:'profile',nodeVersion:process.versions.node,components};
}
