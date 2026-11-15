/* Bake exactly the same transformed GLB used by the public workshop runtime. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const raw=fs.readFileSync(root+'/site/assets/models/earl-roof-attachment-study.glb');
const config=JSON.parse(fs.readFileSync(root+'/site/assets/structural-models-06.json','utf8'));
const viewer={dataset:{rearFrameSrc:'assets/models/earl-roof-attachment-study.glb'},addEventListener(){}};
let result;
class BakeURL extends URL{static createObjectURL(blob){result=blob;return 'blob:baked';}}
vm.runInNewContext(fs.readFileSync(root+'/site/assets/structural-preview-06.js','utf8'),{
  document:{baseURI:'https://baaabs.org/',querySelectorAll:s=>s.startsWith('model-viewer')?[viewer]:[],querySelector:()=>null,dispatchEvent(){}},
  fetch:async url=>url.includes('structural-models')?{ok:true,json:async()=>config}:{ok:true,arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)},
  structuredClone,URL:BakeURL,Blob,TextDecoder,TextEncoder,Uint8Array,DataView,CustomEvent:class{},console,
});
await new Promise(setImmediate);await new Promise(setImmediate);
if(!result)throw Error('No transformed model produced');
const output=process.argv[2];if(!output)throw Error('Expected output GLB path');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.from(await result.arrayBuffer()));
console.log('Baked iteration 06 model:',output);
