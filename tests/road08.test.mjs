import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRoadConfigurations, surveyDatums} from '../site/structural/road-08/road.mjs';
import {IN} from '../site/structural/modular-07/backbone.mjs';

const root = new URL('../site/structural/modular-07/', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path,root),'utf8'));
const design = read('design.json'), recipe = read(design.inputs.recipe);
const revision = read('../road-08/design.json');
const study = compareRoadConfigurations({design,frame:recipe.candidate,donor:recipe.donor,material:read(design.inputs.material)},revision);
const {open,decked,packed} = study.modes;
const approx = (a,b) => assert.ok(Math.abs(a-b) < 1e-6, a+' != '+b);

test('a single steel plane replaces carriers, cassette frames and upper ties on continuous side beams with independent portal and plan bracing', () => {
  assert.ok(!open.items.some(i=>/cassette|removable deck carrier|cross tie .* upper/i.test(i.label)));
  assert.equal(open.items.filter(i=>i.label.startsWith('Transverse floor joist')).length,study.deck.joists);
  assert.ok(!open.items.some(i=>i.group==='ladder' || i.label.startsWith('Cross tie')));
  assert.equal(open.items.filter(i=>i.label==='Continuous side bearer').length,2);
  assert.ok(open.items.some(i=>i.group==='portal'));
  assert.equal(open.items.filter(i=>i.label.startsWith('Plan diagonal')).length,2*design.primary.bayCount);
  assert.equal(open.items.filter(i=>i.label.startsWith('Body shore')).length,revision.preferredShorePairs*2);
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
  const ctx={design,frame:recipe.candidate,donor:recipe.donor,material:read(design.inputs.material)};
  let lastMass=0;
  for (const pairs of revision.shorePairTrials) {
    const trial=compareRoadConfigurations(ctx,revision,pairs);
    assert.equal(trial.stationsIn.length,pairs);
    assert.equal(trial.modes.open.items.filter(i=>i.label.startsWith('Body shore ')).length,pairs*2);
    const [f,r]=ctx.frame.portalXsM.map(x=>x/IN);
    const xs=[f,...trial.stationsIn,r];
    const gaps=xs.slice(1).map((x,i)=>x-xs[i]);
    approx(trial.beam.seated.spanIn,Math.max(...gaps));
    approx(trial.beam.unloaded.spanIn,Math.max(...gaps.slice(1).map((g,i)=>g+gaps[i])));
    assert.ok(trial.modes.open.installedLb>lastMass);
    lastMass=trial.modes.open.installedLb;
    for (const x of trial.stationsIn) {
      const pitchCount=(x-recipe.candidate.pairXsM[1]/IN)/recipe.donor.pillarPitchIn;
      approx(pitchCount,Math.round(pitchCount));
    }
  }
  const initial=compareRoadConfigurations(ctx,revision,recipe.candidate.pairs);
  approx(initial.beam.unloaded.dropMm,16*initial.beam.seated.dropMm);
  assert.equal(study.stationsIn.length,5);
});
