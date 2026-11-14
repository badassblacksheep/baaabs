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
  // Use Earl's visible donor body, not the deck end, as the rear portal datum.
  // This is a placement aid only; a measured rear chassis interface is still required.
  function rearBodyFace(doc, entries, envelope) {
    const candidates = [];
    for (const e of entries.values()) {
      const node = e.node;
      if (node.mesh == null) continue;
      const name = (node.name || '').toLowerCase();
      const component = String(node.extras?.component || '').toLowerCase();
      const meshName = (doc.meshes[node.mesh]?.name || '').toLowerCase();
      const materialNames = (doc.meshes[node.mesh]?.primitives || [])
        .map(p => (doc.materials[p.material]?.name || '').toLowerCase()).join(' ');
      const busPart = component === 'bus' ||
        /^bus[_ .-]/.test(name) ||
        /^bus[_ .-]/.test(meshName) ||
        /workshop_bus_/.test(materialNames);
      if (!busPart || /chassis|frame.?rail|axle|wheel|mirror|hitch|tow|exhaust|engine/.test(name + ' ' + meshName))
        continue;
      const b = meshBounds(doc,node,e.world);
      if (!b || b.hi[1] < 1.9 || b.hi[0] < envelope.x1-2.5) continue;
      candidates.push(b.hi[0]);
    }
    // If no donor-body mesh is identifiable, place the frame conservatively
    // inside the last deck bay instead of assuming the deck edge is the bus end.
    const fallback = envelope.x1 - 0.75;
    return {
      x: candidates.length ? Math.max(...candidates) : fallback,
      basis: candidates.length ? 'visible donor body mesh' : 'provisional deck-inset datum'
    };
  }
  function sourceComponent(doc, node) {
    const names = (doc.meshes[node.mesh]?.primitives || []).map(p=>doc.materials[p.material]?.name || '');
    return names.join(' ');
  }
  function duplicateFront(doc, entries, envelope, rearFace) {
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
    // The mirrored assembly's aftmost face must touch the bus rear body face,
    // leaving any remaining deck behind it as an explicitly visible overhang.
    const mirroredRearEdge = Math.max(...front.map(e =>
      x0 + x1 - meshBounds(doc,e.node,e.world).lo[0]));
    reflect[12] += rearFace.x - mirroredRearEdge;
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
  function appendSchematic(doc, bytes, binStart, binLength, env, rearFace) {
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
    const {z0,z1,y} = env;
    const lowerX=rearFace.x-0.08, upperX=rearFace.x-0.32;
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
  // Owner-approved iteration 02: extend the 36 ft roof two feet forward.
  // Preserve member section sizes and the existing portal/post coordinates.
  function reviseRoof38(doc) {
    if (doc.asset.extras?.roof_iteration === '02-thomas-shoring') return;
    const entries=sceneNodes(doc), old=floorEnvelope(doc,entries);
    if (!old.measured || Math.abs(old.x1-old.x0-36*.3048)>.005)
      throw new Error('38 ft roof revision requires the recorded 36 ft extraction geometry');
    const ratio=38/36, front=old.x1-38*.3048;
    const mapX=x=>front+(x-old.x0)*ratio;
    const stretch=identity();stretch[0]=ratio;stretch[12]=front-ratio*old.x0;
    function setMatrix(node,matrix) {
      delete node.translation;delete node.rotation;delete node.scale;node.matrix=matrix;
    }
    // The selected components are roots or children of the identity body group.
    // Refuse future hierarchy changes that would silently distort their positions.
    const parents=new Map();
    for (const n of doc.nodes)for(const child of n.children||[])parents.set(child,n);
    let floors=0,girders=0,joists=0,diagonals=0;
    const remove=new Set();
    for(const [i,e] of entries) {
      const n=e.node,name=n.name||'';
      const floor=/^Dancefloor_section_/i.test(name);
      const rails=n.extras?.component==='rails';
      const girder=/^Deck edge girder/.test(name),joist=/^Floor joist/.test(name);
      const diagonal=/^Roof bay \d+ diagonal/.test(name);
      if(/^Nose return \|/.test(name)) {remove.add(i);continue;}
      if(!(floor||rails||girder||joist||diagonal))continue;
      const parent=parents.get(i);
      if(parent && nodeMatrix(parent).some((v,j)=>Math.abs(v-identity()[j])>1e-8))
        throw new Error('Unexpected parent transform for '+name);
      if(floor||rails) {
        setMatrix(n,multiply(stretch,e.world));if(floor)floors++;
      } else if(girder) {
        const m=e.world.slice();m[0]*=ratio;m[1]*=ratio;m[2]*=ratio;m[12]=mapX(m[12]);
        setMatrix(n,m);girders++;
      } else if(joist) {
        const m=e.world.slice();m[12]=mapX(m[12]);setMatrix(n,m);joists++;
      } else {
        // These unit-box diagonals run along local Y; local X is vertical.
        const m=e.world, delta=[ratio*m[4],m[5],m[6]];
        const length=Math.hypot(...delta),width=Math.hypot(m[0],m[1],m[2]),depth=Math.hypot(m[8],m[9],m[10]);
        if(Math.abs(delta[1])>1e-5)throw new Error('Expected a horizontal roof diagonal');
        const z=[delta[2]/length,0,-delta[0]/length];
        setMatrix(n,[0,width,0,0,...delta,0,z[0]*depth,0,z[2]*depth,0,mapX(m[12]),m[13],m[14],1]);
        diagonals++;
      }
      n.extras={...(n.extras||{}),roof_iteration:'02-thomas-shoring'};
    }
    if(floors!==12||girders!==2||joists!==13||diagonals!==8||remove.size!==2)
      throw new Error('Unexpected roof member inventory');
    for(const scene of doc.scenes)scene.nodes=scene.nodes.filter(i=>!remove.has(i));
    for(const n of doc.nodes)if(n.children)n.children=n.children.filter(i=>!remove.has(i));
    // Retain original mesh data as provenance, but remove the obsolete returns from the scene.
    doc.asset.extras={...(doc.asset.extras||{}),roof_iteration:'02-thomas-shoring',
      roof_dimensions_ft:[38,8],roof_front_extension_ft:2,
      roof_revision_note:'Owner approved 38 x 8 ft deck over front posts; new shore landing geometry awaits survey.',
      deck_preserved:false};
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
    const rearFace=rearBodyFace(doc,entries,env);
    const copies=duplicateFront(doc,entries,env,rearFace);
    let binary=array.slice(binOffset,binOffset+binLength);
    let method='mirrored '+copies+' existing front members';
    if (!copies) {
      binary=appendSchematic(doc,array,binOffset,binLength,env,rearFace);
      method='schematic rear portal (front member identifiers unavailable)';
    }
    doc.asset.extras={...(doc.asset.extras||{}),
      rear_body_face_datum_m:rearFace.x,rear_body_face_datum_basis:rearFace.basis,
      deck_rear_overhang_from_support_m:env.x1-rearFace.x,
      rear_roof_frame_status:'CONCEPT ONLY - rear chassis feet and engine clearances unverified',
      rear_roof_frame_method:method, deck_preserved:true};
    reviseRoof38(doc);
    return {blob:packageGlb(doc,binary),method:method+'; 38 x 8 ft roof'};
  }
  const base = viewers[0].dataset.rearFrameSrc;
  const source = new URL(base,document.baseURI).href;
  build(source).then(({blob,method})=>{
    const url=URL.createObjectURL(blob);
    viewers.forEach(viewer=>{viewer.src=url;viewer.dataset.rearFrameMethod=method;});
    for (const a of document.querySelectorAll('a[data-rear-frame-download]')) {
      a.href=url;a.download='baaabs-earl-38ft-roof-study.glb';
    }
    document.dispatchEvent(new CustomEvent('rear-frame-ready',{detail:{method}}));
  }).catch(error=>{
    console.error('Rear-frame concept preview failed, using original Earl model',error);
    viewers.forEach(viewer=>{viewer.src=source;});
    const status=document.querySelector('#rear-frame-status');
    if (status) status.textContent='Rear-frame concept could not load; showing original model.';
  });
})();