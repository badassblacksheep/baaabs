import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const site = new URL('../site/', import.meta.url);
const html = fs.readFileSync(new URL('the_build.html', site), 'utf8');
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
  const {panels}=JSON.parse(html.match(/const DATA=(.*);\n/)[1]);
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
  assert.equal(panels.filter(p=>p.folds_m.length).length,14);
  assert.deepEqual(panels.filter(p=>p.bare_steel_lb>26.78).map(p=>p.id),['H-D-014','H-P-014']);
});

test('inspector shows one closed perimeter per booth piece, and the crease on a formed blank', () => {
  const {q,window,location}=workshop();
  for(const id of ['B-D-047','B-D-071','B-D-073','B-D-074','B-D-081','H-D-009']){
    location.hash='#'+id;
    window.emit('hashchange');
    assert.match(q('#title').textContent,new RegExp(id));
    const svg=q('#shape');
    assert.equal(svg.children[0].d.match(/Z/g).length,1);
    const edges=q('#edge-a').children.map(el=>el.textContent);
    assert.equal(edges.at(-1),edges.length+'–1');
    assert.equal(svg.children.some(el=>el['stroke-dasharray']),id==='H-D-009');
  }
  location.hash='#B-D-072';
  window.emit('hashchange');
  assert.match(q('#title').textContent,/B-D-038/);
});
