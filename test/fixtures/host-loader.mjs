// TEST-ONLY host wiring: inert storage declarations and public host observations.
// It must never be used by a product profile or reported as a DSH runtime.
export async function resolve(specifier,context,nextResolve) {
  if(specifier==='test:real-dsh-app-boot')return nextResolve('@deepseek-ai/dsh-app-boot',context);
  if(specifier==='@deepseek-ai/dsh-app-boot')return {url:new URL('./public-app-boot.mjs',import.meta.url).href,shortCircuit:true};
  if(context.parentURL?.endsWith('/lib/dsh.mjs')&&specifier==='@deepseek-ai/dsh-storage-domain')return {url:new URL('./schema-stub.mjs?domain',import.meta.url).href,shortCircuit:true};
  if(context.parentURL?.endsWith('/lib/dsh.mjs')&&specifier==='zod')return {url:new URL('./schema-stub.mjs?zod',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
