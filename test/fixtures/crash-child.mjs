import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {publishFile,readSync} from './atomic-store.mjs';
const [directory,scenario,mutation]=process.argv.slice(2);
const lib=process.env.HM_TEST_LIB||resolve('lib');
const {IdentityController}=await import(pathToFileURL(join(lib,'controller.js')).href);
const {INITIAL_OBSERVATION}=await import(pathToFileURL(join(lib,'validation.js')).href);
const local=join(directory,'local.json'),remote=join(directory,'remote-fixture.json');
function checkpoint(where){return new Promise(()=>{process.send({checkpoint:where,pid:process.pid,evidence:'SIGKILL_CONTRACT_FIXTURE'});setInterval(()=>{},10000);});}
if(scenario.startsWith('group-')) {
  const next={schemaVersion:1,revision:1,status:'expired',observedAt:'2026-09-13T00:00:00.000Z',logoutPending:true};
  await publishFile(local,next,where=>where===scenario.slice(6)?checkpoint(where):Promise.resolve());
} else {
  let armed=scenario==='login';
  const store={read:()=>readSync(local,INITIAL_OBSERVATION),close:async()=>{},publish:async value=>{
    await publishFile(local,value);
    if(armed&&mutation==='reverse'&&((scenario==='login'&&value.status==='signed_in')||(scenario==='logout'&&value.status==='expired'&&!value.logoutPending))) await checkpoint('local-completion-before-remote');
  }};
  // No credentials are written to disk, even in the fixture. Only activity facts.
  const fetcher=async(url,init)=>{
    const path=new URL(url).pathname;
    const json=(v,h={})=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json',...h}});
    if(path==='/api/auth/sign-in/email') {
      await publishFile(remote,{active:true,revoked:false});
      if(armed&&scenario==='login')await checkpoint('remote-login-before-local');
      return json({ok:true},{'set-cookie':'fixture=synthetic-cookie; HttpOnly; Secure; Path=/'});
    }
    if(path==='/api/auth/sign-out') {
      await publishFile(remote,{active:false,revoked:true});
      if(armed&&scenario==='logout')await checkpoint('remote-revocation-before-local');
      return json({ok:true});
    }
    return json({principal:{principalId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',deploymentId:'crash-fixture',displayName:'Crash fixture',scopes:['identity:read:self']}});
  };
  const c=new IdentityController({identityOrigin:'https://identity.example.invalid',deploymentId:'crash-fixture'},store,fetcher);
  await c.signIn({email:'fixture@example.invalid',password:'synthetic-password-only'});
  if(scenario==='logout'){armed=true;await c.signOut();}
}
throw new Error('Crash checkpoint was not reached');
