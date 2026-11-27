import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRoadConfigurations, surveyDatums} from '../site/structural/road-08/road.mjs';
import {IN} from '../site/structural/modular-07/backbone.mjs';

const root = new URL('../site/structural/modular-07/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path,root),'utf8'));
const design = read('design.json'), recipe = read(design.inputs.recipe);
const revision = read('../road-08/design.json');
const study = compareRoadConfigurations({design,frame:recipe.candidate,material:read(design.inputs.material)},revision);
const {open,decked,packed} = study.modes;
const approx = (a,b) => assert.ok(Math.abs(a-b) < 1e-6, a+' != '+b);

test('a single steel plane replaces carriers, cassette frames and upper ties on continuous side beams with independent portal and plan bracing', () => {
  assert.ok(!open.items.some(i=>/cassette|removable deck carrier|cross tie .* upper/i.test(i.label)));
  assert.equal(open.items.filter(i=>i.label.startsWith('Transverse floor joist')).length,study.deck.joists);
  assert.ok(!open.items.some(i=>i.group==='ladder' || i.label.startsWith('Cross tie')));
  assert.equal(open.items.filter(i=>i.label==='Continuous side bearer').length,2);
  assert.ok(open.items.some(i=>i.group==='portal'));
  assert.equal(open.items.filter(i=>i.label.startsWith('Plan diagonal')).length,2*design.primary.bayCount);
  assert.equal(open.items.filter(i=>i.label.startsWith('Body shore')).length,recipe.candidate.shorePositions.length);
  const xs=open.items.filter(i=>i.label.startsWith('Transverse floor joist')).map(i=>i.points[0][0]);
  const length=recipe.candidate.deckLengthIn*IN;
  for(let i=0;i<=design.primary.bayCount;i++) assert.ok(xs.some(x=>Math.abs(x-(xs[0]+i*length/design.primary.bayCount))<1e-6));
  assert.equal(packed.items.length,0);
  assert.deepEqual(decked.items.filter(i=>!i.face),open.items);
  assert.ok(open.items.every(i=>['primary','shores','deck'].includes(i.layer)));
});

test('both plywood lanes tile the deck end-to-end with all end joints supported and staggered', () => {
  const faces=decked.items.filter(i=>i.face);
  const joists=open.items.filter(i=>i.label.startsWith('Transverse floor joist'));
  const [front,rear]=recipe.candidate.deckBoundsM;
  let area=0;
  const joints=[];
  for(const isDriver of [true,false]) {
    const lane=faces.filter(f=>(f.points[0][1]<0)===isDriver);
    let end=front;
    const seams=[];
    for(const f of lane) {
      const [a,b,c]=f.points;
      approx(a[0],end);
      assert.ok(joists.some(j=>Math.abs(j.points[0][0]-b[0])<1e-6));
      area+=(b[0]-a[0])*(c[1]-b[1]);
      end=b[0];
      if (end<rear-1e-6) seams.push(end);
    }
    approx(end,rear);
    joints.push(seams);
  }
  assert.ok(!joints[0].some(a=>joints[1].some(b=>Math.abs(a-b)<1e-6)));
  approx(area/0.3048**2,study.areaFt2);
  assert.equal(study.deck.blocks,joists.length-1);
  assert.equal(open.facesToFit,faces.length);
  approx(decked.installedLb-open.installedLb,study.plywoodLb);
  approx(decked.topIn-open.topIn,design.deck.plyThicknessIn);
  assert.ok(study.deck.massSavedLb>0 && study.deck.heightSavedIn>0);
  const axle=surveyDatums(recipe.donor).find(d=>d.label==='Rear axle');
  approx(axle.points[0][0],recipe.donor.rearAxleIn*IN);
});

test('the beam sensitivity uses the surveyed support spacing and the governing single missing shore', () => {
  approx(study.beam.seated.spanIn,recipe.candidate.pairPitchIn);
  approx(study.beam.unloaded.spanIn,2*recipe.candidate.pairPitchIn);
  approx(study.beam.unloaded.momentKNm,4*study.beam.seated.momentKNm);
  approx(study.beam.unloaded.dropMm,16*study.beam.seated.dropMm);
});
