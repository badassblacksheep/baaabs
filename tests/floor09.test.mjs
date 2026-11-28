import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {foldingFloor} from '../site/structural/floor-09/floor.mjs';
import {deployedSeats,shellFit,wingGeometry} from '../site/structural/floor-09/wings.mjs';

const root=new URL('../site/structural/modular-07/',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const design=read('design.json'),recipe=read(design.inputs.recipe),shape=read('../floor-09/design.json');
const r=foldingFloor({design,frame:recipe.candidate,donor:recipe.donor,material:read(design.inputs.material)},
  read('../road-08/design.json'),shape);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' differs from '+b);

test('Rev 09 retains the Rev 08 core steel and portals, narrows the forward deck and accounts for every changed surface',()=>{
  assert.equal(r.base.stationsIn.length,5);
  const [front]=recipe.candidate.deckBoundsM;
  const tip=r.fixedFaces.filter(s=>s.points[0][0]===front);
  assert.equal(tip.length,2);
  near(Math.max(...tip.flatMap(s=>s.points.map(p=>Math.abs(p[1])))),shape.tongueWidthIn*.0254/2);
  assert.equal(r.trimmers.length,2);
  const sum=r.fixedFaces.reduce((total,s)=>{
    const [a,b,c]=s.points;return total+(b[0]-a[0])*(c[1]-b[1]);
  },0);
  near(sum/.3048**2,r.fixedArea);near(r.fixedArea,280);near(r.wingArea,96);
  near(r.deckedLb-r.steelLb,(r.fixedArea+r.wingArea)*design.deck.plyLbFt2);
  assert.ok(r.deckedLb>r.base.modes.decked.installedLb && r.steelLb>r.base.modes.open.installedLb);
});

test('mirrored hanging leaves rotate rigidly into the floor plane and share four outer support lines per side',()=>{
  const {layout}=r;
  for(const degrees of [0,45,90]) {
    const faces=wingGeometry(layout,degrees,true).filter(i=>i.face);
    assert.equal(faces.length,6);
    assert.equal(wingGeometry(layout,degrees,false).filter(i=>i.face).length,0);
    for(const [i,f] of faces.slice(0,3).entries()) {
      const [a,b,c]=f.points;near(b[0]-a[0],layout.leafLength);
      near(Math.hypot(c[1]-b[1],c[2]-b[2]),layout.reach);
      f.points.forEach((p,j)=>{const m=faces[i+3].points[j];near(p[0],m[0]);near(p[1],-m[1]);near(p[2],m[2]);});
      if(degrees===90){near(c[2],layout.surface);near(Math.abs(c[1]),layout.half+layout.reach);}
      if(degrees===0){near(a[1],c[1]);near(a[2]-c[2],layout.reach);}
    }
  }
  const seats=deployedSeats(layout);assert.equal(seats.length,8);
  near(seats[0].points[0][0],layout.begin);near(seats[3].points[0][0],layout.end);
});

test('registered head crosses the floor plane and real crown sheets overlap both deployed wings',()=>{
  const overlap=shellFit(r.layout,read(design.inputs.panels),read(design.inputs.shellConfig));
  assert.ok(overlap.head.length>0 && overlap.head.every(s=>s.points.every(p=>Math.abs(p[2]-r.layout.surface)<1e-8)));
  for(const side of ['D','P']) {
    const group=overlap.crowns.filter(s=>s.label.startsWith('B-'+side+'-'));
    const gap=Math.min(...group.map(s=>s.gapIn));
    assert.ok(gap>0 && gap<7);
    for(const {points} of group) for(const [x,y] of points) {
      assert.ok(x>=r.layout.begin-1e-7 && x<=r.layout.end+1e-7);
      assert.ok(Math.abs(y)>=r.layout.half-1e-7 && Math.abs(y)<=r.layout.half+r.layout.reach+1e-7);
    }
  }
});
