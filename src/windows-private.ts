import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';

// chmod/open modes cannot express owner-only access on Windows. Remove inherited
// ACEs before any key bytes are written; files inherit this user's full-control ACE.
export async function privateWindowsDirectory(path: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const system = process.env['SystemRoot'] ?? process.env['SYSTEMROOT'];
  if (!system) throw Object.assign(new Error('Windows system directory unavailable'), {code: 'EACCES'});
  const script = `$ErrorActionPreference='Stop';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::FullControl,([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule);Set-Acl -LiteralPath $env:HM_PRIVATE_DIRECTORY -AclObject $acl`;
  try {
    await promisify(execFile)(join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      {env: {...process.env, HM_PRIVATE_DIRECTORY: path}, timeout: 10000, windowsHide: true});
  } catch { throw Object.assign(new Error('Private directory ACL unavailable'), {code: 'EACCES'}); }
}
