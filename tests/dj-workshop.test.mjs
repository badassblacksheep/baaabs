import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const site = new URL('../site/', import.meta.url);
const html = fs.readFileSync(new URL('the_build.html', site), 'utf8');
const {panels, panel_count, omitted} = JSON.parse(html.match(/const DATA=(.*);\n/)[1]);
const script = html.match(/<script>\s*(const DATA=[\s\S]*?)<\/script>/)[1];

class Element {
  children = [];
  events = new Map();
  classList = {toggle(){}};
  dataset = {};
  style = {};
  checked = false;
  value = '';
  addEventListener(type, listener) {
    this.events.set(type, [...(this.events.get(type) || []), listener]);
  }
  emit(type) { for (const fn of this.events.get(type) || []) fn({ target: this }); }
  before() {}
  append(...items) { this.children.push(...items); }
  remove() {}
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this[key] = String(value); }
}

function workshop() {
  const elements = new Map();
  const q = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  for (const id of ['#inspect-vertices','#layer-panels','#layer-bus','#layer-equipment']) q(id).checked = true;
  const window = new Element();
  const location = {hash:'#dj-booth'};
  const document = Object.assign(new Element(), {
    querySelector:q, querySelectorAll:()=>[], createTextNode:text=>text, createElement:()=>new Element(), createElementNS:()=>new Element()
  });
  const cx = vm.createContext({
    window, document, location, matchMedia:()=>({matches:true}), setTimeout:()=>1,
    clearTimeout(){}, requestAnimationFrame:()=>1, cancelAnimationFrame(){}
  });
  vm.runInContext(script, cx);
  vm.runInContext(fs.readFileSync(new URL('panel-inspector.js', site), 'utf8'), cx);
  return {q, window, location, cx};
}

test('booth deep link and interior button set opposite sightlines at the same target', () => {
  const {q} = workshop();
  const model = q('#model');
  model.emit('load');
  assert.match(model.cameraOrbit, /^0deg 90deg/);
  const target = model.cameraTarget;
  q('#booth-interior').emit('click');
  assert.equal(model.cameraTarget,target);
  assert.match(model.cameraOrbit,/^180deg 90deg/);
  assert.equal(q('#inspect-vertices').checked,false);
  assert.ok(html.includes('assets/models/BAAABS-Animated-Eyes.blend'));
});

test('every detachable piece occupies one flat sheet inside 5 × 10 ft stock', () => {
  assert.equal(panels.length,panel_count);
  assert.equal(new Set(panels.map(p=>p.id)).size,panel_count);
  for(const p of panels){
    const v=p.vertices_m;
    assert.equal(new Set(v.map(point=>point.join(','))).size,v.length,p.id);
    assert.equal(v.length,p.flat_vertices_m.length,p.id);
    assert.ok(p.length_m<=119*.0254+1e-7 && p.width_m<=59*.0254+1e-7,p.id);
    assert.ok(p.stock_margin_in>=.5-1e-6,p.id);
    assert.match(p.material,/McNICHOLS.*steel/);
    assert.equal(p.thickness_in,.0359);
    assert.equal(p.open_area_fraction,.4);
    assert.ok(p.edge_lengths_m.every(s=>s>1e-7),p.id);
    const area=loop=>Math.abs(loop.reduce((sum,a,i)=>{
      const b=loop[(i+1)%loop.length];
      return sum+a[0]*b[1]-a[1]*b[0];
    },0))/2;
    const holes=p.flat_holes_m.reduce((sum,h)=>sum+area(h),0);
    assert.ok(Math.abs(area(p.flat_vertices_m)-holes-p.net_area_m2)<1e-6,p.id);
  }
  // Bound the handling assumptions used by the preceding workshop release.
  assert.ok(panels.every(p=>p.handling_half_lb <= 41.01 && p.handling_one_lb <= 53.23));
});

test('the installed vertices and openings reconstruct from each registered flat cut pattern', () => {
  const layout=JSON.parse(fs.readFileSync(new URL('assets/earl-panel-layout.json',site),'utf8'));
  assert.equal(layout.panel_count,panel_count);
  const modeled=new Map(layout.pieces.map(p=>[p.id,p]));
  for(const p of panels){
    const model=modeled.get(p.id);
    assert.deepEqual(model.vertices_m,p.vertices_m);
    assert.deepEqual(model.holes_m,p.holes_m);
    assert.equal(p.folds_m?.length||0,0,p.id);
    assert.equal(p.formed_angle_deg||0,0,p.id);
    const world=[p.vertices_m,...p.holes_m];
    const cut=[p.flat_vertices_m,...p.flat_holes_m];
    for(let i=0;i<world.length;i++)for(let j=0;j<world[i].length;j++){
      const [u,v]=cut[i][j];
      const residual=world[i][j].map((x,axis)=>x-p.origin_m[axis]-u*p.u_axis[axis]-v*p.v_axis[axis]);
      assert.ok(Math.hypot(...residual)<=1e-6,p.id+' misses its cutting plane');
    }
  }
});

test('all exterior blanks are strictly convex simple polygons with three to six corners', () => {
  for(const p of panels){
    const v=p.flat_vertices_m;
    assert.ok(v.length >= 3 && v.length <= 6, p.id);
    // Every non-endpoint corner must lie strictly on the same side of every
    // directed edge. This catches reflex corners, retraced edges and star paths.
    let orientation;
    for(let i=0;i<v.length;i++){
      const j=(i+1)%v.length;
      const dx=v[j][0]-v[i][0], dy=v[j][1]-v[i][1];
      for(let k=0;k<v.length;k++){
        if(k===i || k===j)continue;
        const distance=(dx*(v[k][1]-v[i][1])-dy*(v[k][0]-v[i][0]))/Math.hypot(dx,dy);
        orientation ??= Math.sign(distance);
        assert.ok(orientation*distance > 1e-7,p.id+' edge '+i);
      }
    }
  }
});

test('hoof perimeters and circular openings match the donor register', () => {
  const original=JSON.parse(fs.readFileSync(new URL('../reference/panels/earl-before-dj.json',site),'utf8')).panels;
  const hooves=entries=>entries.filter(p=>p.region==='Hoof').map(p=>[p.id,p.vertices_m]);
  assert.equal(hooves(panels).length,6);
  for(const [id,vertices] of hooves(panels)){
    const prior=original.find(p=>p.id===id).vertices_m;
    const dx=vertices[0][0]-prior[0][0];
    vertices.forEach(([x,y,z],i)=>{
      assert.ok(Math.abs(x-prior[i][0]-dx)<1e-7,id);
      assert.equal(y,prior[i][1]); assert.equal(z,prior[i][2]);
    });
  }
  const openings=entries=>entries.flatMap(p=>p.holes_m.map(h=>JSON.stringify(h))).sort();
  assert.deepEqual(openings(panels),openings(original));
});

test('inspector displays each flat window piece and its interior holes', () => {
  const {q,window,location}=workshop();
  const inspection=panels.filter(p=>p.dj_booth || p.holes_m.length);
  for(const id of ['B-D-048','B-D-050']){
    assert.ok(inspection.some(p=>p.id===id),id);
  }
  for(const p of inspection){
    location.hash='#'+p.id;
    window.emit('hashchange');
    assert.match(q('#title').textContent,new RegExp(p.id));
    const svg=q('#shape');
    assert.equal(svg.children[0].d.match(/Z/g).length,1+p.holes_m.length);
    const edges=q('#edge-a').children.map(el=>el.textContent);
    assert.equal(edges.length,p.vertices_m.length);
    assert.equal(edges.at(-1),edges.length+'–1');
    assert.equal(svg.children.filter(el=>el['stroke-dasharray']).length,0);
  }
});

test('a retired seam ID links to its surviving sheet', () => {
  const ids=new Set(panels.map(p=>p.id));
  const combined=panels.find(p=>p.merged_from_ids?.some(id=>!ids.has(id)));
  assert.ok(combined);
  const retired=combined.merged_from_ids.find(id=>!ids.has(id));
  const {q,window,location}=workshop();
  location.hash='#'+retired;
  window.emit('hashchange');
  assert.match(q('#title').textContent,new RegExp(combined.id));
});


test('the workshop registers precisely the crown sheets retained around the Rev 09 floor', () => {
  const original=JSON.parse(fs.readFileSync(new URL('../reference/panels/earl-before-dj.json',site),'utf8')).panels;
  const crowns=original.filter(p=>p.id.startsWith('B-')&&p.name.includes(' Crown '));
  assert.equal(crowns.length,16);
  const floor=JSON.parse(fs.readFileSync(new URL('structural/floor-09/design.json',site),'utf8'));
  assert.deepEqual(omitted,floor.omitCrownIds);
  const {q,window,location}=workshop();
  for(const crown of crowns){
    location.hash='#'+crown.id;
    window.emit('hashchange');
    const active=panels.find(p=>p.id===crown.id)||panels.find(p=>p.prior_ids?.includes(crown.id)||p.merged_from_ids?.includes(crown.id));
    if(omitted.includes(crown.id)){assert.equal(active,undefined,crown.id);continue;}
    assert.ok(active,crown.id);
    assert.match(q('#title').textContent,new RegExp(active.id));
  }
});

test('one flat triangle spans the entire top of the DJ opening', () => {
  const {q,location,window}=workshop();
  const header=panels.find(p=>p.id==='B-D-074');
  assert.equal(header.vertices_m.length,3);
  assert.ok(header.dj_booth);
  const base=header.vertices_m.filter(v=>Math.abs(v[2]-2.55)<1e-6).sort((a,b)=>a[0]-b[0]);
  assert.equal(base.length,2);
  assert.ok(Math.abs(base[0][0]+1.55)<1e-6 && Math.abs(base[1][0]+.67)<1e-6);
  const apex=header.vertices_m.find(v=>v[2]>2.55);
  assert.ok(apex);
  const neighbors=panels.filter(p=>p.id!==header.id).flatMap(p=>p.vertices_m.map((v,i)=>[v,p.vertices_m[(i+1)%p.vertices_m.length]]));
  function edgeDistance(point,[a,b]){
    const edge=b.map((x,i)=>x-a[i]);
    const offset=point.map((x,i)=>x-a[i]);
    const t=Math.max(0,Math.min(1,edge.reduce((sum,x,i)=>sum+x*offset[i],0)/edge.reduce((sum,x)=>sum+x*x,0)));
    return Math.hypot(...offset.map((x,i)=>x-t*edge[i]));
  }
  for(const corner of base)for(const t of [.1,.5,.9]){
    const sample=apex.map((x,i)=>x+t*(corner[i]-x));
    assert.ok(neighbors.some(edge=>edgeDistance(sample,edge)<2e-6),'open joint along header');
  }
  for(const [id,replacement] of Object.entries({
    'B-D-073':'B-D-074','B-D-086':'B-D-074','B-D-090':'B-D-074',
    'B-D-085':'B-D-031','B-D-089':'B-D-031',
  })){
    assert.ok(!panels.some(p=>p.id===id),id);
    location.hash='#'+id;
    window.emit('hashchange');
    assert.match(q('#title').textContent,new RegExp(replacement));
    assert.match(q('#viewer-status').textContent,new RegExp(id+'.*'+replacement));
    if(replacement===header.id)assert.equal(q('#edge-a').children.length,3);
  }
});


test('bare steel preview restores the paint and layer toggles preserve the perforations', () => {
  const {q, cx} = workshop();
  const spec = JSON.parse(fs.readFileSync(new URL('assets/panel-skin.json', site)));
  const panel = {
    name:'Panel_B-D-049', mode:'MASK', cutoff:spec.alphaCutoff, emissiveFactor:[0,0,0],
    getAlphaMode(){return this.mode;}, getAlphaCutoff(){return this.cutoff;},
    setAlphaMode(mode){this.mode=mode; this.cutoff=mode==='MASK' ? .5 : undefined;},
    setAlphaCutoff(value){this.cutoff=value;}, setEmissiveFactor(){},
    pbrMetallicRoughness:{
      baseColorFactor:[...spec.baseColorFactor], metallicFactor:spec.metallic, roughnessFactor:spec.roughness,
      setBaseColorFactor(value){this.baseColorFactor=Array.from(value);},
      setMetallicFactor(value){this.metallicFactor=value;},
      setRoughnessFactor(value){this.roughnessFactor=value;}
    }
  };
  const preview=q('#preview-bare-steel');
  const input=html.match(/<input id="preview-bare-steel"[^>]*>/)[0];
  assert.doesNotMatch(input,/\bchecked\b/);
  preview.dataset.metallic=input.match(/data-metallic="([^"]+)"/)[1];
  preview.dataset.roughness=input.match(/data-roughness="([^"]+)"/)[1];
  // Bind by the registered model component, independently of material naming.
  const frame={...panel,name:'Solid aperture trim',mode:'OPAQUE',
    pbrMetallicRoughness:{...panel.pbrMetallicRoughness,baseColorFactor:[.018,.020,.024,1]}};
  const donor={...frame,name:'Workshop_bus_DJ_Glazing',
    pbrMetallicRoughness:{...frame.pbrMetallicRoughness,baseColorFactor:[.2,.2,.2,.4]}};
  const item=JSON.parse(fs.readFileSync(new URL('assets/earl-panel-layout.json',site))).special_items[0];
  q('#model').originalGltfJson={materials:[{name:frame.name},{name:donor.name}],
    nodes:[{mesh:0,extras:{component:item.component}}],meshes:[{primitives:[{material:0}]}]};
  q('#model').model = {materials:[panel,frame,donor]};
  vm.runInContext(fs.readFileSync(new URL('panel-layers.js', site),'utf8'),cx);
  const pbr=panel.pbrMetallicRoughness;
  const finish=()=>[pbr.baseColorFactor,pbr.metallicFactor,pbr.roughnessFactor];
  assert.deepEqual(finish(),[spec.baseColorFactor,spec.metallic,spec.roughness]);
  preview.checked=true; preview.emit('change');
  assert.deepEqual(finish(),[[1,1,1,1],spec.bareSteel.metallic,spec.bareSteel.roughness]);
  assert.deepEqual(frame.pbrMetallicRoughness.baseColorFactor,[.018,.020,.024,1]);
  preview.checked=false; preview.emit('change');
  assert.deepEqual(finish(),[spec.baseColorFactor,spec.metallic,spec.roughness]);
  assert.equal(panel.cutoff,spec.alphaCutoff);
  const toggle=q('#layer-panels');
  toggle.checked=false; toggle.emit('change');
  assert.equal(panel.mode,'BLEND');
  assert.equal(frame.pbrMetallicRoughness.baseColorFactor[3],0);
  assert.equal(donor.pbrMetallicRoughness.baseColorFactor[3],.4);
  toggle.checked=true; toggle.emit('change');
  assert.equal(panel.mode,'MASK');
  assert.equal(frame.mode,'OPAQUE');
  assert.deepEqual(frame.pbrMetallicRoughness.baseColorFactor,[.018,.020,.024,1]);
  assert.equal(panel.cutoff,spec.alphaCutoff);
});

test('camera framing resolves real cutouts up close and closes them at whole-sheep scale', () => {
  const {q,cx}=workshop();
  const spec=JSON.parse(fs.readFileSync(new URL('assets/panel-skin.json',site)));
  const viewer=q('#model'), sheet={name:'Panel_B-D-033',mode:'MASK',cutoff:spec.alphaCutoff,
    getAlphaMode(){return this.mode;},getAlphaCutoff(){return this.cutoff;},setAlphaCutoff(v){this.cutoff=v;}};
  const range=spec.viewHeightMeters;
  let span=range.opaquePanels*2;
  viewer.model={materials:[sheet,{name:'Workshop_bus_DJ_Glazing'}]};
  viewer.originalGltfJson={asset:{extras:{panelVisibility:{...range,alphaCutoff:spec.alphaCutoff}}}};
  viewer.getFieldOfView=()=>60;
  viewer.getCameraOrbit=()=>({radius:span/(2*Math.tan(Math.PI/6))});
  vm.runInContext(fs.readFileSync(new URL('assets/panel-view-detail.js',site),'utf8'),cx);
  cx.window.attachPanelVisibility(viewer);
  assert.equal(sheet.cutoff,0);
  span=(range.fullPerforations+range.opaquePanels)/2;
  viewer.emit('camera-change');
  assert.ok(Math.abs(sheet.cutoff-spec.alphaCutoff/2)<.001);
  span=range.fullPerforations/2;
  viewer.emit('camera-change');
  assert.equal(sheet.cutoff,spec.alphaCutoff);
  sheet.mode='BLEND';
  span=range.opaquePanels*2;
  viewer.emit('camera-change');
  assert.equal(sheet.cutoff,spec.alphaCutoff);
  sheet.mode='MASK';
  cx.window.updatePanelVisibility(viewer,true);
  assert.equal(sheet.cutoff,0);
});

test('the register lists the booth frame as a searchable driver-side special item', () => {
  const {q}=workshop();
  q('#search').value='DJ-FRAME';
  q('#search').emit('input');
  const rows=q('#rows').children;
  assert.equal(rows.length,1);
  assert.equal(rows[0].children[0].children[0].href,'#DJ-FRAME');
  assert.match(rows[0].children[1].textContent,/DJ booth frame · special item/);
  assert.equal(q('#count').textContent,`0 of ${panel_count} panels · 1 special item`);
  q('#side').value='Passenger';
  q('#side').emit('change');
  assert.equal(q('#rows').children.length,0);
});
