// TEST-ONLY loader: supplies two inert declarations for adapter-wiring tests.
// It must never be used by a product profile or reported as a DSH runtime.
export async function resolve(specifier,context,nextResolve) {
  if(specifier==='@deepseek-ai/dsh-storage-domain')return {url:new URL('./schema-stub.mjs?domain',import.meta.url).href,shortCircuit:true};
  if(specifier==='zod')return {url:new URL('./schema-stub.mjs?zod',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
