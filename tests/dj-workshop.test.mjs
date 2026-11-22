import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const site = new URL('../site/', import.meta.url);
const html = fs.readFileSync(new URL('the_build.html', site), 'utf8');
const {panels} = JSON.parse(html.match(/const DATA=(.*);\n/)[1]);
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
    querySelector:q, querySelectorAll:()=>[], createElement:()=>new Element(), createElementNS:()=>new Element()
  });
  const cx = vm.createContext({
    window, document, location, matchMedia:()=>({matches:true}), setTimeout:()=>1,
    clearTimeout(){}, requestAnimationFrame:()=>1, cancelAnimationFrame(){}
  });
  vm.runInContext(script, cx);
  vm.runInContext(fs.readFileSync(new URL('panel-inspector.js', site), 'utf8'), cx);
  return {q, window, location};
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

test('every detachable piece occupies a single developed sheet inside 5 × 10 ft stock', () => {
  assert.equal(panels.length,206);
  assert.equal(new Set(panels.map(p=>p.id)).size,206);
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
  assert.deepEqual(hooves(panels),hooves(original));
  const openings=entries=>entries.flatMap(p=>p.holes_m.map(h=>JSON.stringify(h))).sort();
  assert.deepEqual(openings(panels),openings(original));
});

test('inspector displays each window piece and respects interior holes and formed creases', () => {
  const {q,window,location}=workshop();
  const inspection=panels.filter(p=>p.dj_booth || p.holes_m.length);
  const folded=panels.find(p=>p.folds_m.length);
  if(folded)inspection.push(folded);
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
    assert.equal(svg.children.filter(el=>el['stroke-dasharray']).length,p.folds_m.length);
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
