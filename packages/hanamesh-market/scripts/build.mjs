import {readFile,rm,cp,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await rm('lib',{recursive:true,force:true});await cp('src','lib',{recursive:true});
const state=await readFile('src/client-state.js','utf8'),client=await readFile('src/client.js','utf8');
const visual=await readFile('src/client-visual.js','utf8');
const source=state+'\n'+visual+'\n'+client.replace(/^import .*from ['\"]\.\/client-visual\.js['\"];?\s*$/m,'').replace(/^import .*from ['"]\.\/client-state\.js['"];?\s*$/m,'');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
await writeFile('lib/client.js',`window.__ModuleLoader__.load({id:'@hanamesh/market',factory:function(require){'use strict';const module={exports:{}};const exports=module.exports;\n${code}\nreturn module.exports;}});\n`);
for(const file of ['lib/index.js','lib/client.js']){const check=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(check.status!==0)process.exit(check.status??1);}
