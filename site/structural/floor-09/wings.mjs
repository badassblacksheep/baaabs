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
      const line=(p,q,name)=>items.push({kind:'line', layer:'wing', group:'leaf-frame', section:[layout.tubeWidth,tubeDepth], label:label+' · '+name, points:[p,q]});
      for (const r of [layout.tubeWidth/2,reach-layout.tubeWidth/2]) line(point(a,r,mid),point(b,r,mid),'long edge');
      for (let j=0;j<=Math.round(leafLength/pitch);j++) {
        const x=Math.max(a+layout.tubeWidth/2,Math.min(b-layout.tubeWidth/2,a+j*pitch));
        line(point(x,layout.tubeWidth,mid),point(x,reach-layout.tubeWidth,mid),'transverse rib');
      }
      if (fitted) items.push({kind:'polygon',layer:'wing',face:true,label,down:[0,-sign*Math.cos(angle),-Math.sin(angle)],
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

// The arm keeps its full length in both poses. A removable saddle bridges the
// gap between the low receiver line and the underside of the level leaf frame.
export function wingSupports(layout,extended) {
  const {begin,end,leafLength,half,reach,surface,thickness,tubeDepth,support,girder,joist}=layout;
  const inches=k=>support[k]*IN;
  const sleeve=inches('receiverOutsideIn'), wall=inches('receiverWallIn'), arm=inches('armOutsideIn');
  const engage=inches('engagementIn'), length=reach+engage, seat=inches('seatLengthIn'), pin=inches('pinDiameterIn');
  const top=surface-thickness, z=top-girder.depth-sleeve/2;
  if (!(0<wall && arm<sleeve-2*wall && length<half && pin<engage && arm>0)) throw Error('Invalid support envelopes');
  const items=[];
  for(const sign of [-1,1]) for(let i=0;i<=Math.round((end-begin)/leafLength);i++) {
    const x=begin+i*leafLength, tip=extended?reach:0;
    const label=(sign<0?'Driver':'Passenger')+' support '+(i+1);
    function box(role,pose,x1,x2,r1,r2,z1,z2) {
      const y1=sign*(half+r1), y2=sign*(half+r2);
      items.push({kind:'box',layer:'supports',group:role,pose,label:label+' · '+role,
        points:[[x+x1,Math.min(y1,y2),z1],[x+x2,Math.max(y1,y2),z2]]});
    }
    // Four walls keep the receiver bore visible around the nested sliding member.
    for(const side of [-1,1]) {
      const dx=side*(sleeve-wall)/2;
      box('receiver wall','fixed',dx-wall/2,dx+wall/2,-length,0,z-sleeve/2,z+sleeve/2);
      const dz=side*(sleeve-wall)/2;
      box('receiver wall','fixed',-sleeve/2+wall,sleeve/2-wall,-length,0,z+dz-wall/2,z+dz+wall/2);
    }
    // Outboard the sleeve bears against the side girder; inboard it hangs below the transverse joist.
    box('inboard receiver hanger','fixed',-joist.width/2,joist.width/2,-length,-length+sleeve,
      z+sleeve/2,top-joist.depth);
    box('slide arm',extended?'event':'folded',-arm/2,arm/2,tip-length,tip,z-arm/2,z+arm/2);
    const r=-engage/2;
    items.push({kind:'line',layer:'supports',group:'lock pin',pose:'fixed',label:label+' · keeper pin',
      section:[pin,pin],points:[[x-sleeve/2-wall,sign*(half+r),z],[x+sleeve/2+wall,sign*(half+r),z]]});
    if(extended)box('removable bearing saddle','event',-seat/2,seat/2,
      reach-layout.tubeWidth,reach,z+arm/2,surface-thickness-tubeDepth);
  }
  return items;
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
