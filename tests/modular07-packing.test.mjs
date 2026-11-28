import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPacking} from '../site/structural/modular-07/packing.mjs';

const read = uri => JSON.parse(readFileSync(new URL(uri,import.meta.url), 'utf8'));
const design = read('../site/structural/modular-07/design.json');
const {donor, candidate: frame} = read('../site/assets/earl-deck-model.json');
const panels = read('../site/structural/modular-07/panel-layout.json');
const material = read('../site/structural/iteration-06-materials.json');
const shellConfig = read('../site/structural/modular-07/shell-data.json');
import {IN as inch, buildBackbone, compareDecks} from '../site/structural/modular-07/backbone.mjs';
import {buildShell} from '../site/structural/modular-07/shell.mjs';
const pair = design.audio.mvp;
function inventory(format) {
  const ctx = {donor, design, frame, panels, material, shellConfig};
  const selected = compareDecks(ctx).find(d => d.id === format.id);
  ctx.analysis = {selected};
  const model = buildBackbone(ctx);
  return [...model.cargo, ...buildShell(ctx,model.nodes).cargo];
}

for (const format of design.deck.formats) {
  test('packing '+format.id+' accounts for every part and preserves access', () => {
    const cargo = inventory(format);
    const {metrics,items} = buildPacking({donor,design,cargo,panels});
    assert.equal(metrics.inside+metrics.staged,cargo.reduce((n,g)=>n+g.count,0));
    assert.equal(metrics.deferredSheets, panels.panel_count);
    assert.ok(panels.pieces.some(p=>p.id===metrics.longestSheet.id));
    assert.ok(metrics.longestSheet.spanIn>0);
    assert.ok(metrics.deferredSpecialIds.includes('DJ-FRAME'));
    const inner = items.filter(item=>item.location==='inside');
    assert.equal(inner.length,metrics.inside);
    assert.ok(inner.length>0);
    const gap = design.transport.separatorIn*inch;
    const eps = 1e-8;
    for (const [i,a] of inner.entries()) {
      const [lo,hi] = a.points;
      assert.ok(lo[0]>=design.transport.endGapIn*inch-eps && hi[0]<=(donor.aisleIn-design.transport.endGapIn)*inch+eps);
      assert.ok(lo[1]>=(-donor.floorWidthIn/2+design.transport.wallGapIn)*inch-eps);
      assert.ok(hi[1]<=(donor.floorWidthIn/2-design.transport.wallGapIn)*inch+eps);
      assert.ok(hi[1]<=-metrics.reservedAisleIn*inch/2+eps || lo[1]>=metrics.reservedAisleIn*inch/2-eps);
      assert.ok(lo[2]>=design.transport.rackBaseIn*inch-eps && hi[2]<=donor.wallIn*inch+eps);
      for (const b of inner.slice(i+1)) {
        assert.ok([0,1,2].some(k=>hi[k]+gap<=b.points[0][k]+eps || b.points[1][k]+gap<=lo[k]+eps),a.label+' overlaps '+b.label);
      }
      if (a.layer==='audio') assert.ok(Math.abs(hi[2]-lo[2]-pair.sizeM[2])<eps);
    }
    for (const group of cargo) assert.equal(items.filter(item=>item.cargoId===group.id).length,group.count);
  });
}

test('oversize pieces are staged outside the cabin, with counts preserved', () => {
  const cargo = [{layer:'primary',id:'Oversize',count:2,sizeM:[donor.aisleIn*inch+1,.1,.1]}];
  const {metrics,items} = buildPacking({donor,design,cargo,panels});
  assert.equal(metrics.inside,0);
  assert.equal(metrics.staged,2);
  assert.ok(items.filter(i=>i.cargoId).every(i=>i.points[0][1]>donor.floorWidthIn*inch/2));
});

test('invalid envelope data fails before placement', () => {
  assert.throws(()=>buildPacking({donor,design,cargo:[{layer:'audio',id:'Unknown',count:1,sizeM:[0,0,0]}],panels}),
    /Invalid or duplicate/);
});
