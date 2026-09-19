// TEST-ONLY: no Zod validation or DSH storage behavior is simulated here.
const schema={int(){return this;},nonnegative(){return this;},nullable(){return this;},optional(){return this;},strict(){return this;}};
export const z={object:()=>schema,number:()=>schema,literal:()=>schema,string:()=>schema,boolean:()=>schema,enum:()=>schema,array:()=>schema,union:()=>schema};
export const defineDomain=spec=>Object.freeze(spec);
