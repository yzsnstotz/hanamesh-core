/** Official package-document selection, followed only on absence by repository README. */
import {readPackageDocument,languageChain,npmFiles,NPM_FILE_SOURCES,readmeByName,markdownOf,detailImage} from '@deepseek-ai/dsh-plugin-detail';
import {randomUUID} from 'node:crypto';
import {MarketError,ensure,readJson} from './catalog.js';
const safePath=path=>typeof path==='string'&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
export function createDocumentReader({fetchImpl=fetch,timeoutMs=8000,maxBytes=262144,maxImagesBytes=2097152,cacheEntries=50,lifetime=new AbortController().signal}={}){
 const documents=new Map();
 const options={timeoutMs,lifetime};
 const repositoryFiles=(repo,ref)=>{
  ensure(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)&&/^[0-9a-f]{40}$/i.test(ref),'REPOSITORY_IDENTITY_REQUIRED');
  const files={key:repo+'#'+ref,async read(path,max,signal){ensure(safePath(path),'DOCUMENT_PATH_INVALID');const url='https://raw.githubusercontent.com/'+repo+'/'+ref+'/'+path.split('/').map(encodeURIComponent).join('/');const response=await fetchImpl(url,{credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,lifetime,AbortSignal.timeout(timeoutMs)])});if(response.status===404)return undefined;ensure(response.ok,'DOCUMENT_READ_FAILED',502);let bytes=0;const chunks=[];for await(const chunk of response.body??[]){bytes+=chunk.length;ensure(bytes<=max,'DOCUMENT_TOO_LARGE',502);chunks.push(chunk);}return Buffer.concat(chunks);}};
  files.readme=(dir,max,signal)=>readmeByName((...args)=>files.read(...args),dir,max,signal);return files;
 };
 return{
  async read({item,target,version,language='zh'},signal=new AbortController().signal){
   let files,document;
   if(target?.source==='npm')files=npmFiles(target.name,version??target.version,NPM_FILE_SOURCES,options);
   else if(target?.source==='github')files=repositoryFiles(target.repo,target.ref);
   if(files)document=await readPackageDocument(files,target?.source==='github'?(target.path??''):'',languageChain(language),maxBytes,signal);
   if(!document&&item.githubRepo){ensure(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.githubRepo),'REPOSITORY_IDENTITY_REQUIRED');
    let ref=target?.source==='github'&&target.repo.toLowerCase()===item.githubRepo.toLowerCase()?target.ref:null;
    if(!ref){const value=await readJson(fetchImpl,'https://api.github.com/repos/'+item.githubRepo+'/commits/HEAD',{method:'GET',headers:{accept:'application/vnd.github+json'},signal:AbortSignal.any([signal,lifetime])},{timeoutMs,maxBytes});ensure(/^[0-9a-f]{40}$/i.test(value.sha),'REPOSITORY_IDENTITY_REQUIRED');ref=value.sha;}
    files=repositoryFiles(item.githubRepo,ref);const found=await files.readme('',maxBytes,signal);if(found)document={origin:'repository',path:found.path,markdown:markdownOf(found.bytes)};
   }
   if(!document)return{status:'none'};
   const id=randomUUID();documents.set(id,{files,path:document.path});while(documents.size>cacheEntries)documents.delete(documents.keys().next().value);
   return{status:'found',...document,document:id};
  },
  async image(id,authored,signal){const record=documents.get(id);ensure(record,'DOCUMENT_EXPIRED',404);const image=detailImage(record.path,authored);ensure(image,'IMAGE_PATH_INVALID');const bytes=await record.files.read(image.path,maxImagesBytes,signal);ensure(bytes,'IMAGE_NOT_FOUND',404);return{bytes,mediaType:image.mediaType};},
  close(){documents.clear();},
 };
}
