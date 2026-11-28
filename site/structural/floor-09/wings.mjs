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
  for(const sheet of panels.pieces) {
    const pts=sheet.vertices_m.map(([x,y,z])=>[x-datum.frontBumperWorldXM,y,z]);
    if(sheet.id.startsWith('H-')) {
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
    const sign=sheet.id.startsWith('B-D-')?-1:1;
    let intersection=clip(pts,0,layout.begin,1);
    intersection=clip(intersection,0,layout.end,-1);
    intersection=clip(intersection,1,sign*layout.half,sign);
    intersection=clip(intersection,1,sign*(layout.half+layout.reach),-sign);
    if(intersection.length<3) continue;
    const lowest=Math.min(...intersection.map(p=>p[2]));
    crowns.push({kind:'polygon',layer:'panels',points:intersection,label:sheet.id,
      gapIn:(lowest-layout.surface)/IN});
  }
  return {crowns,head};
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
