import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareDecks,buildBackbone,equipmentDemand,IN} from '../site/structural/modular-07/backbone.mjs';

const root=new URL('../site/structural/modular-07/',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const design=read('design.json'), ctx={design};
for(const [key,path] of Object.entries(design.inputs))ctx[key]=read(path);
Object.assign(ctx,{frame:ctx.recipe.candidate,donor:ctx.recipe.donor});
const layouts=compareDecks(ctx);
const build=selected=>buildBackbone({...ctx,analysis:{selected}});

test('cassette swaps preserve the surveyed structure, panel pickups and side-stage interfaces',()=>{
  const layout=build(layouts[0]);
  const invariant=model=>model.nodes.filter(n=>n.classId!=='deck');
  for(const selected of layouts){
    const model=build(selected);
    assert.deepEqual(invariant(model),invariant(layout));
    assert.equal(selected.count*selected.widthIn*selected.lengthIn,ctx.frame.deckWidthIn*ctx.frame.deckLengthIn);
    assert.equal(model.nodes.filter(n=>n.classId==='deck').length,2*(selected.rows+1));
    assert.deepEqual(model.nodes.filter(n=>n.classId==='shore').map(n=>n.positionM),ctx.frame.shorePositions);
    assert.equal(new Set(model.nodes.map(n=>n.id)).size,model.nodes.length);
    assert.ok(model.nodes.every(n=>n.allowableLocalForcesKN.every(x=>x===null)&&n.allowableLocalMomentsKNm.every(x=>x===null)));
  }
});

test('party-side projection, independent floor support and axle first moments',()=>{
  const model=build(layouts[0]);
  const speakerBoxes=model.items.filter(i=>i.kind==='box'&&i.group==='mvp');
  assert.equal(speakerBoxes.length,design.audio.mvp.count);
  assert.ok(speakerBoxes.every(i=>i.points[0][2]===0 && i.points[1][1]<model.driver));
  for(const i of model.items.filter(i=>i.arrow)){
    const [a,b]=i.points;
    assert.ok(b[1]<a[1] && a[0]===b[0] && a[2]===b[2]);
  }
  const node=model.nodes.filter(n=>n.classId.endsWith('Audio'));
  assert.ok(node.length&&node.every(n=>n.positionM[1]===model.driver&&n.side==='driver'));
  const aperture=ctx.shellConfig.apertureWorldXZM.map(p=>p[0]-ctx.shellConfig.frontBumperWorldXM);
  assert.ok(Math.min(...model.stageXs)<Math.min(...aperture)&&Math.max(...model.stageXs)>Math.max(...aperture));
  for(const mass of design.audio.studyMassesKg){
    const r=equipmentDemand(ctx,model,mass);
    assert.ok(Math.abs(r.frontKg+r.rearKg-mass)<1e-8);
    assert.ok(Math.abs(r.rearKg*ctx.donor.wheelbaseIn*IN-mass*(r.x-ctx.donor.frontAxleIn*IN))<1e-8);
    assert.ok(r.rollKNm>r.localMomentKNm);
  }
});

test('published probe and crowd studies agree with the configured geometry and loads',()=>{
  const {cases,crowdCases}=ctx.stiffness;
  const nominal=cases.filter(c=>c.model==='07' && c.shoreKLbfPerIn===ctx.recipe.loadInputs.shoreK_LbfPerIn);
  assert.equal(nominal.length,design.stiffnessStudy.jointFactors.length+1);
  for(const [i,c] of nominal.slice(1).entries())assert.ok(c.dropMm>nominal[i].dropMm&&c.twistMrad>nominal[i].twistMrad);
  for(const c of crowdCases){
    assert.equal(c.appliedLbf,c.multiplier*c.people*c.personLbf);
    assert.equal(c.patchLengthFt,design.stiffnessStudy.crowdPatchFt);
    assert.ok(c.peakShoreLbf>0 && c.peakVerticalDropMm>0);
  }
});
