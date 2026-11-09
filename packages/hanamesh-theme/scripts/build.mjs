import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
await mkdir('lib',{recursive:true});
const source=await readFile('src/client.js','utf8');
// This dependency-free ESM face is also checked directly by Node. DSH loads its
// lazy factory, without bundling another copy of any host service or React.
const body=source.replaceAll('export const ','const ').replaceAll('export function ','function ');
await writeFile('lib/client.js',`window.__ModuleLoader__.load({id:'@hanamesh/theme',factory:function(require){'use strict';\n${body}\nreturn {name,inject,tokens,apply};}});\n`);
await copyFile('src/index.js','lib/index.js');
