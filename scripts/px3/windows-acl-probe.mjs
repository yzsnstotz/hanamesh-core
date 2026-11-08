import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
const run=promisify(execFile),root=join(process.env.RUNNER_TEMP,'px3-acl-probe-'+process.pid);
await mkdir(root);
try{
 const script=`$ErrorActionPreference='Stop';'START';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;'SID_OK';$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::FullControl,([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule);'RULE_OK';Set-Acl -LiteralPath $env:HM_PRIVATE_DIRECTORY -AclObject $acl;'ACL_OK'`;
 for(const mode of ['command','encoded']){
  const began=Date.now();
  try{const result=await run(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive',...(mode==='command'?['-Command',script]:['-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')])],{timeout:15000,env:{...process.env,HM_PRIVATE_DIRECTORY:root}});console.log(JSON.stringify({mode,ms:Date.now()-began,...result}));}catch(error){console.log(JSON.stringify({mode,ms:Date.now()-began,code:error.code,killed:error.killed,stdout:error.stdout,stderr:error.stderr}));}
 }
 const {privateWindowsDirectory}=await import('../../src/windows-private.ts');
 try{await privateWindowsDirectory(root);console.log('PRODUCT_ACL_PASS');}catch(error){console.log('PRODUCT_ACL_FAIL '+error.code);process.exitCode=1;}
}finally{await rm(root,{recursive:true,force:true});}
