import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {foldingFloor} from '../site/structural/floor-09/floor.mjs';
import {wingSupports,eventGuard,shellFit,wingGeometry} from '../site/structural/floor-09/wings.mjs';

const root=new URL('../site/structural/modular-07/',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const design=read('design.json'),recipe=read(design.inputs.recipe),shape=read('../floor-09/design.json');
const r=foldingFloor({design,frame:recipe.candidate,donor:recipe.donor,material:read(design.inputs.material)},
  read('../road-08/design.json'),shape);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' differs from '+b);

test('the full rectangular core and both sill-supported end portals carry over intact',()=>{
  assert.equal(r.base.stationsIn.length,5);
  const core=r.base.modes.decked.items.filter(i=>i.face);
  const [front,rear]=recipe.candidate.deckBoundsM;
  const width=2*r.layout.half;
  for(const x of [front,rear]) {
    const ends=core.flatMap(s=>s.points.filter(p=>Math.abs(p[0]-x)<1e-7));
    near(Math.max(...ends.map(p=>p[1]))-Math.min(...ends.map(p=>p[1])),width);
  }
  const steel=r.base.modes.open.items;
  const sills=steel.filter(s=>s.label.toLowerCase().includes('transverse sill'));
  assert.equal(sills.length,2);
  for(const sill of sills) {
    const [a,b]=sill.points;
    const feet=steel.filter(s=>s.label.toLowerCase().includes('corner post') && Math.abs(s.points[0][0]-a[0])<1e-7);
    assert.equal(feet.length,2);
    assert.ok(feet.every(s=>s.points[0][1]>a[1] && s.points[0][1]<b[1]));
  }
  near(r.fixedArea,288);near(r.fixedArea+r.wingArea,384);
  near(r.steelLb-r.base.modes.open.installedLb,r.wingFrameLb);
  near(r.deckedLb-r.base.modes.decked.installedLb,r.wingFrameLb+r.wingPlyLb);
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
  const seats=wingSupports(layout,true).filter(i=>i.group==='slide arm');assert.equal(seats.length,8);
  const station=s=>(s.points[0][0]+s.points[1][0])/2;
  near(station(seats[0]),layout.begin);near(station(seats[3]),layout.end);
});

test('the build drops precisely the crown sheets projecting over the full deployed floor',()=>{
  const {front,rear,begin,end,half,reach}=r.layout;
  const baseline=read(design.inputs.panels);
  const active=read('../floor-09/'+shape.panelLayout);
  const datum=read(design.inputs.shellConfig);
  const {head,headSideGapIn,crowns}=shellFit(r.layout,active,datum);
  assert.ok(head.length>0 && headSideGapIn>9 && headSideGapIn<10);
  const rectangles=[[front,rear,-half,half],[begin,end,-half-reach,-half],[begin,end,half,half+reach]];
  function overlaps(points,[x0,x1,y0,y1]) {
    const rect=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    const axes=[[1,0],[0,1],...points.map(([x,y],i)=>{
      const [u,v]=points[(i+1)%points.length];return [v-y,x-u];
    })];
    return axes.every(([a,b])=>{
      const proj=polygon=>polygon.map(([x,y])=>x*a+y*b);
      const u=proj(points),v=proj(rect);
      return Math.min(Math.max(...u),Math.max(...v))-Math.max(Math.min(...u),Math.min(...v))>1e-10;
    });
  }
  const original=shellFit(r.layout,baseline,datum).crowns;
  const over=original.filter(c=>rectangles.some(rect=>overlaps(c.points,rect))).map(c=>c.label);
  assert.deepEqual(active.omitted.sort(),over.sort());
  const originalIds=baseline.pieces.filter(s=>!over.includes(s.id)).map(s=>s.id);
  const added=active.paired_splits.flatMap(s=>s.added);
  assert.deepEqual(active.pieces.map(s=>s.id),[...originalIds,...added].sort());
  assert.equal(active.panel_count,shape.targetPanelCount);
  const pieceArea=piece=>{
    const v=piece.vertices_m,normal=[0,0,0];
    for(let i=0;i<v.length;i++) for(let k=0;k<3;k++) {
      const a=v[i], b=v[(i+1)%v.length],j=(k+1)%3,l=(k+2)%3;
      normal[k]+=a[j]*b[l]-a[l]*b[j];
    }
    return Math.hypot(...normal)/2;
  };
  for(const step of active.paired_splits) for(const [i,parent] of step.parents.entries()) {
    const area=pieceArea(baseline.pieces.find(p=>p.id===parent));
    for(const id of [parent,step.added[i]]) near(pieceArea(active.pieces.find(p=>p.id===id)),area/2);
  }
  assert.equal(crowns.length,6);
  assert.ok(crowns.every(c=>rectangles.every(rect=>!overlaps(c.points,rect))));
});

test('the event guard encloses wing tips and returns and has a gated rear stair entrance',()=>{
  const {layout}=r, items=eventGuard(layout);
  const gates=items.filter(i=>i.label==='Rear access gate');
  assert.equal(gates.length,2);
  const upper=gates.at(-1).points;
  near(upper[0][0],layout.rear);near(upper[1][1]-upper[0][1],layout.guard.gateWidthM);
  const top=items.filter(i=>i.label==='Perimeter guard' && Math.abs(i.points[0][2]-upper[0][2])<1e-8);
  for(let i=1;i<top.length;i++) assert.deepEqual(top[i].points[0],top[i-1].points[1]);
  assert.deepEqual(top[0].points[0],upper[0]);assert.deepEqual(top.at(-1).points[1],upper[1]);
  for(const x of [layout.begin,layout.end]) for(const sign of [-1,1])
    assert.ok(top.some(s=>s.points.every(p=>p[0]===x) && s.points.some(p=>p[1]===sign*(layout.half+layout.reach))));
});

test('each deployed slide retains engagement and retracts its full travel inside a receiver',()=>{
  const {layout}=r;
  const stages=[false,true].map(extended=>wingSupports(layout,extended));
  const arms=stages.map(parts=>parts.filter(p=>p.group==='slide arm'));
  const fixed=parts=>parts.filter(p=>p.pose==='fixed');
  assert.deepEqual(fixed(stages[0]),fixed(stages[1]));
  assert.equal(stages[0].filter(p=>p.group==='removable bearing saddle').length,0);
  const seats=stages[1].filter(p=>p.group==='removable bearing saddle');
  assert.equal(seats.length,arms[1].length);
  const radial=box=>box.points.map(p=>Math.abs(p[1])).sort((a,b)=>a-b);
  for(const [i,open] of arms[1].entries()){
    const [heel,tip]=radial(open), [inboard,foldedTip]=radial(arms[0][i]);
    near(tip-foldedTip,layout.reach);near(foldedTip,layout.half);
    near(heel-inboard,layout.reach);assert.ok(heel<layout.half);
    near(seats[i].points[0][2],open.points[1][2]);
    near(seats[i].points[1][2],layout.surface-layout.thickness-layout.tubeDepth);
    const walls=fixed(stages[0]).filter(p=>p.group==='receiver wall' &&
      p.label.split(' · ')[0]===open.label.split(' · ')[0]);
    assert.equal(walls.length,4);
    for(const w of walls){const [a,b]=radial(w);near(a,inboard);near(b,foldedTip);}
  }
});
