// Wing geometry is expressed in the same front-bumper datum as the fixed floor.
import {IN} from '../modular-07/backbone.mjs';

export function wingGeometry(layout, degrees, fitted) {
  const angle = degrees * Math.PI / 180;
  const items = [];
  const {begin, end, half, surface, reach, leafLength, pitch, thickness, tubeDepth} = layout;
  const leaves = Math.round((end-begin)/leafLength);
  // The axis is at the depth of the trial underside at the inboard edge. Knuckles,
  // body clearance and the real hinge offset need a full-scale swept-volume mock-up.
  for (const sign of [-1,1]) {
    const side = sign < 0 ? 'Driver' : 'Passenger';
    const offset=thickness+tubeDepth;
    const point = (x,r,below=0) => [x, sign*(half+r*Math.sin(angle)+(offset-below)*Math.cos(angle)),
      surface-offset-r*Math.cos(angle)+(offset-below)*Math.sin(angle)];
    for (let i=0;i<leaves;i++) {
      const a=begin+i*leafLength, b=a+leafLength;
      const label=side+' wing '+(i+1);
      const mid=thickness+tubeDepth/2;
      const line=(p,q,name)=>items.push({kind:'line', layer:'wing', group:'leaf-frame', label:label+' · '+name, points:[p,q]});
      for (const r of [0,reach]) line(point(a,r,mid),point(b,r,mid),'long edge');
      for (let j=0;j<=Math.round(leafLength/pitch);j++) {
        const x=a+j*pitch;
        line(point(x,0,mid),point(x,reach,mid),'transverse rib');
      }
      if (fitted) items.push({kind:'polygon',layer:'wing',face:true,label,
        points:[point(a,0),point(b,0),point(b,reach),point(a,reach)]});
    }
  }
  return items;
}

// Clip the actual 3-D facets in plan, interpolating height at each new intersection.
function clip(points,axis,limit,sense) {
  const out=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length];
    const inside=p=>sense*(p[axis]-limit)>=0;
    if(inside(a)) out.push(a);
    if(inside(a)!==inside(b)) {
      const t=(limit-a[axis])/(b[axis]-a[axis]);
      out.push(a.map((v,j)=>v+t*(b[j]-v)));
    }
  }
  return out;
}

export function shellFit(layout, panels, datum) {
  if(panels.survey_date!==datum.surveyDate) throw Error('Shell and deck survey references differ');
  const crowns=[], head=[];
  let headSideGap=Infinity;
  for(const sheet of panels.pieces) {
    const pts=sheet.vertices_m.map(([x,y,z])=>[x-datum.frontBumperWorldXM,y,z]);
    if(sheet.id.startsWith('H-')) {
      // Constrain the comparison to the finished plywood's actual thickness and length.
      let slab=clip(pts,2,layout.surface-layout.thickness,1);
      slab=clip(slab,2,layout.surface,-1);
      slab=clip(clip(slab,0,layout.front,1),0,layout.rear,-1);
      if(slab.length) {
        const ys=slab.map(p=>p[1]);
        const distance=Math.max(0,Math.min(...ys),-Math.max(...ys));
        headSideGap=Math.min(headSideGap,distance-layout.half);
      }
      const ends=[];
      for(let i=0;i<pts.length;i++) {
        const a=pts[i],b=pts[(i+1)%pts.length];
        if((a[2]>layout.surface)!==(b[2]>layout.surface)) {
          const t=(layout.surface-a[2])/(b[2]-a[2]);
          ends.push(a.map((v,j)=>v+t*(b[j]-v)));
        }
      }
      if(ends.length===2) head.push({kind:'line',layer:'panels',points:ends,label:sheet.id});
    }
    if(!/\bCrown\b/i.test(sheet.name) || !sheet.id.startsWith('B-')) continue;
    crowns.push({kind:'polygon',layer:'panels',points:pts,label:sheet.id});
  }
  return {crowns,head,headSideGapIn:Number.isFinite(headSideGap)?headSideGap/IN:null};
}

// Only the exposed travel of each arm is drawn. Receiver engagement is unsized.
// A shared seat at each interior leaf seam has a separate latch for each leaf.
export function deployedSeats(layout) {
  const {begin,end,leafLength,half,reach,surface,thickness,tubeDepth}=layout;
  const count=Math.round((end-begin)/leafLength)+1;
  const z=surface-thickness-tubeDepth;
  return [-1,1].flatMap(sign=>Array.from({length:count},(_,i)=>{
    const x=begin+i*leafLength;
    return {kind:'line',layer:'primary',guide:true,label:'Slide-out support arm',
      points:[[x,sign*half,z],[x,sign*(half+reach),z]]};
  }));
}

// The removable event guard follows the whole stepped perimeter; the seam
// between a level wing and the core is an internal walking edge.
export function eventGuard(layout) {
  const {front,rear,begin,end,half,reach,leafLength,surface,guard}=layout;
  const outside=half+reach, gate=guard.gateWidthM/2;
  const left=[[rear,-gate],[rear,-half],[end,-half],[end,-outside]];
  for(let x=end-leafLength;x>begin+1e-7;x-=leafLength) left.push([x,-outside]);
  left.push([begin,-outside],[begin,-half],[front,-half]);
  const path=[...left,...left.map(([x,y])=>[x,-y]).reverse()];
  const items=[];
  for(const [i,[x,y]] of path.entries()) {
    const top=[x,y,surface+guard.heightM];
    items.push({layer:'guard',kind:'line',label:'Guard post',points:[[x,y,surface],top]});
    if(i===0) continue;
    for(const fraction of [0.5,1]) {
      const z=surface+guard.heightM*fraction;
      items.push({layer:'guard',kind:'line',label:'Perimeter guard',points:[[...path[i-1],z],[x,y,z]]});
    }
  }
  for(const fraction of [0.5,1]) {
    const z=surface+guard.heightM*fraction;
    items.push({layer:'guard',kind:'line',guide:true,label:'Rear access gate',points:[[rear,-gate,z],[rear,gate,z]]});
  }
  return items;
}
