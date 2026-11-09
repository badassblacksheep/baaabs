/* BAAABS rear attachment study: browser-generated GLB revision, not an engineered design.
 * This preserves the original mesh and materials while mirroring localized front
 * structural members. If the source GLB lacks identifiable front members, draw
 * a clearly labeled schematic rear portal instead. All rear feet are unverified.
 */
(() => {
  const viewers = [...document.querySelectorAll('model-viewer[data-rear-frame-src]')];
  if (!viewers.length) return;

  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const multiply = (a, b) => {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++)
        for (let k = 0; k < 4; k++)
          out[4 * col + row] += a[4 * k + row] * b[4 * col + k];
    return out;
  };
  function nodeMatrix(node) {
    if (node.matrix) return node.matrix;
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale || [1, 1, 1];
    const [tx, ty, tz] = node.translation || [0, 0, 0];
    return [
      (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1
    ];
  }
  function transform(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
    ];
  }
  function sceneNodes(doc) {
    const seen = new Map();
    const roots = doc.scenes[doc.scene ?? 0].nodes || [];
    function walk(i, parent, parentName) {
      const n = doc.nodes[i];
      const world = multiply(parent, nodeMatrix(n));
      seen.set(i, {node: n, world, ancestry: parentName});
      for (const child of n.children || []) walk(child, world, (parentName + ' ' + (n.name || '')).trim());
    }
    for (const i of roots) walk(i, identity(), '');
    return seen;
  }
  function meshBounds(doc, n, matrix) {
    const mesh = doc.meshes[n.mesh];
    if (!mesh) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of mesh.primitives || []) {
      const acc = doc.accessors[p.attributes?.POSITION];
      if (!acc?.min || !acc?.max) continue;
      for (let corner = 0; corner < 8; corner++) {
        const v = [0, 1, 2].map(i => corner & (1 << i) ? acc.max[i] : acc.min[i]);
        const pos = transform(matrix, v);
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], pos[i]); hi[i] = Math.max(hi[i], pos[i]); }
      }
    }
    return Number.isFinite(lo[0]) ? {lo, hi} : null;
  }
  function floorEnvelope(doc, entries) {
    const floor = [];
    for (const e of entries.values()) {
      if (!/^Dancefloor_section_/i.test(e.node.name || '') || e.node.mesh == null) continue;
      const b = meshBounds(doc, e.node, e.world);
      if (b) floor.push(b);
    }
    if (!floor.length) return {x0:-5.4864,x1:5.4864,z0:-1.2192,z1:1.2192,y:4.4,measured:false};
    const x0 = Math.min(...floor.map(b=>b.lo[0])), x1 = Math.max(...floor.map(b=>b.hi[0]));
    const z0 = Math.min(...floor.map(b=>b.lo[2])), z1 = Math.max(...floor.map(b=>b.hi[2]));
    const y = Math.min(...floor.map(b=>b.lo[1]));
    if (!(x1-x0>8 && x1-x0<15 && z1-z0>1.5 && z1-z0<4 && y>2 && y<7))
      return {x0:-5.4864,x1:5.4864,z0:-1.2192,z1:1.2192,y:4.4,measured:false};
    return {x0,x1,z0,z1,y,measured:true};
  }
  function sourceComponent(doc, node) {
    const names = (doc.meshes[node.mesh]?.primitives || []).map(p=>doc.materials[p.material]?.name || '');
    return names.join(' ');
  }
  function duplicateFront(doc, entries, envelope) {
    const {x0,x1} = envelope, length = x1 - x0;
    const front = [];
    for (const e of entries.values()) {
      const n = e.node;
      if (n.mesh == null) continue;
      const b = meshBounds(doc, n, e.world);
      if (!b) continue;
      const type = String(n.extras?.component || '').toLowerCase();
      const material = sourceComponent(doc, n);
      const path = ((e.ancestry || '') + ' ' + (n.name || '')).toLowerCase();
      const support = /mounts|bracing|subframe/.test(type) || /Workshop_(mounts|subframe)_/.test(material);
      const localized = b.lo[0] < x0 + 0.08 * length &&
                        b.hi[0] < x0 + 0.26 * length &&
                        b.hi[0] - b.lo[0] < 0.32 * length;
      const notReference = !/chassis.?rail|engine|bus_|panel|hoof|wheel|speaker|stairs/i.test(path);
      if (support && localized && notReference) front.push(e);
    }
    if (front.length < 3 || front.length > 50) return 0;
    const reflect = identity(); reflect[0] = -1; reflect[12] = x0 + x1;
    for (const e of front) {
      const copy = {...e.node, name:'Rear study · mirror of '+(e.node.name || 'front member')};
      delete copy.translation; delete copy.rotation; delete copy.scale; delete copy.children;
      copy.matrix = multiply(reflect, e.world);
      copy.extras = {...(e.node.extras || {}), rear_attachment_status:'Unverified conceptual mirror', rear_study:true};
      const index = doc.nodes.push(copy)-1;
      doc.scenes[doc.scene ?? 0].nodes.push(index);
    }
    return front.length;
  }
  function appendSchematic(doc, bytes, binStart, binLength, env) {
    const positions = [], normals = [];
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1])
      for (const [u, v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]) {
        const point = [0,0,0], normal=[0,0,0];
        point[axis] = sign; point[(axis+1)%3] = sign*u; point[(axis+2)%3] = v; normal[axis]=sign;
        positions.push(...point.map(a=>a/2)); normals.push(...normal);
      }
    const original = bytes.slice(binStart, binStart+binLength), extra = positions.length*4 + normals.length*4;
    const binary = new Uint8Array(binLength + extra);
    binary.set(original);
    const dv = new DataView(binary.buffer);
    const addAccessor = (name, values, offset) => {
      const view = doc.bufferViews.push({buffer:0,byteOffset:binLength+offset,byteLength:values.length*4,target:34962})-1;
      values.forEach((value,i)=>dv.setFloat32(binLength+offset+i*4,value,true));
      const accessor = {bufferView:view,componentType:5126,count:36,type:'VEC3'};
      if (name==='POSITION') {accessor.min=[-0.5,-0.5,-0.5];accessor.max=[0.5,0.5,0.5];}
      return doc.accessors.push(accessor)-1;
    };
    const position = addAccessor('POSITION',positions,0);
    const normal = addAccessor('NORMAL',normals,positions.length*4);
    const material = doc.materials.push({name:'Workshop_mounts_rear_concept',
      pbrMetallicRoughness:{baseColorFactor:[0.73,0.38,0.21,1],metallicFactor:0.35,roughnessFactor:0.58},
      doubleSided:true})-1;
    const mesh = doc.meshes.push({name:'Rear portal conceptual tube',
      primitives:[{attributes:{POSITION:position,NORMAL:normal},material}]})-1;
    const {x1,z0,z1,y} = env;
    const upperX=x1-0.25, lowerX=x1-1.00;
    const upperY=y-0.09, lowerY=Math.max(1.25,y-3.15);
    const left=z0+0.13, right=z1-0.13, tube=0.075;
    const L=[lowerX,lowerY,left],R=[lowerX,lowerY,right];
    const TL=[upperX,upperY,left],TR=[upperX,upperY,right];
    function member(name,a,b,width=tube) {
      const d=b.map((v,i)=>v-a[i]), len=Math.hypot(...d), nx=d[0]/len, ny=d[1]/len, nz=d[2]/len;
      let q;
      if (nx < -0.999999) q=[0,1,0,0];
      else {const scale=Math.sqrt(2*(1+nx));q=[0,-nz/scale,ny/scale,scale/2];}
      const t=a.map((v,i)=>(v+b[i])/2);
      const node={name:'Rear study · '+name,mesh,translation:t,rotation:q,scale:[len,width,width],
        extras:{component:'mounts',rear_study:true,rear_attachment_status:'NOT VERIFIED - chassis survey required'}};
      doc.scenes[doc.scene??0].nodes.push(doc.nodes.push(node)-1);
    }
    member('driver end post',L,TL);
    member('passenger end post',R,TR);
    member('top portal tie',TL,TR);
    member('lower conceptual tie',L,R);
    member('portal X diagonal A',L,TR,tube*0.78);
    member('portal X diagonal B',R,TL,tube*0.78);
    // Two visual feet: locations intentionally remain hypotheses, not chassis coordinates.
    member('driver provisional foot', [lowerX-0.13,lowerY,left], [lowerX+0.13,lowerY,left],0.14);
    member('passenger provisional foot', [lowerX-0.13,lowerY,right], [lowerX+0.13,lowerY,right],0.14);
    doc.buffers[0].byteLength = binary.length;
    return binary;
  }
  function packageGlb(doc, binary) {
    const raw = new TextEncoder().encode(JSON.stringify(doc));
    const padded = (raw.length + 3) & ~3;
    const total = 12+8+padded+8+binary.length;
    const result = new Uint8Array(total);
    const dv = new DataView(result.buffer);
    dv.setUint32(0,0x46546c67,true); dv.setUint32(4,2,true); dv.setUint32(8,total,true);
    dv.setUint32(12,padded,true);dv.setUint32(16,0x4e4f534a,true);
    result.fill(0x20,20,20+padded); result.set(raw,20);
    dv.setUint32(20+padded,binary.length,true);dv.setUint32(24+padded,0x004e4942,true);
    result.set(binary,28+padded);
    return new Blob([result],{type:'model/gltf-binary'});
  }
  async function build(source) {
    const response = await fetch(source);
    if (!response.ok) throw new Error('GLB request failed: '+response.status);
    const array = new Uint8Array(await response.arrayBuffer());
    const dv = new DataView(array.buffer);
    if (dv.getUint32(0,true)!==0x46546c67 || dv.getUint32(4,true)!==2)
      throw new Error('Expected glTF binary v2');
    const jsonLength = dv.getUint32(12,true), binHeader = 20+jsonLength;
    const binLength = dv.getUint32(binHeader,true), binOffset=binHeader+8;
    if (dv.getUint32(16,true)!==0x4e4f534a || dv.getUint32(binHeader+4,true)!==0x004e4942)
      throw new Error('Expected JSON and BIN chunks');
    const doc = JSON.parse(new TextDecoder().decode(array.subarray(20,20+jsonLength)));
    const entries=sceneNodes(doc), env=floorEnvelope(doc,entries);
    const copies=duplicateFront(doc,entries,env);
    let binary=array.slice(binOffset,binOffset+binLength);
    let method='mirrored '+copies+' existing front members';
    if (!copies) {
      binary=appendSchematic(doc,array,binOffset,binLength,env);
      method='schematic rear portal (front member identifiers unavailable)';
    }
    doc.asset.extras={...(doc.asset.extras||{}),rear_roof_frame_status:'CONCEPT ONLY - rear chassis feet and engine clearances unverified',
      rear_roof_frame_method:method, deck_preserved:true};
    return {blob:packageGlb(doc,binary),method};
  }
  const base = viewers[0].dataset.rearFrameSrc;
  const source = new URL(base,document.baseURI).href;
  build(source).then(({blob,method})=>{
    const url=URL.createObjectURL(blob);
    viewers.forEach(viewer=>{viewer.src=url;viewer.dataset.rearFrameMethod=method;});
    for (const a of document.querySelectorAll('a[data-rear-frame-download]')) {
      a.href=url;a.download='baaabs-earl-rear-frame-concept.glb';
    }
    document.dispatchEvent(new CustomEvent('rear-frame-ready',{detail:{method}}));
  }).catch(error=>{
    console.error('Rear-frame concept preview failed, using original Earl model',error);
    viewers.forEach(viewer=>{viewer.src=source;});
    const status=document.querySelector('#rear-frame-status');
    if (status) status.textContent='Rear-frame concept could not load; showing original model.';
  });
})();