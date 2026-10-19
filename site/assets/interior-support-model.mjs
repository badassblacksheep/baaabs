export function study(data,inputs={}){
 const d=data.defaults,g=data.geometry;
 const clamp=(v,a,b,f)=>{const n=Number(v);return Math.max(a,Math.min(b,Number.isFinite(n)?n:f))};
 const cabin=clamp(inputs.cabin??d.clear_interior_width_in,84,94,d.clear_interior_width_in);
 const post=clamp(inputs.post??d.post_width_in,3,6,d.post_width_in),envelope=post+2*d.finish_allowance_each_side_in;
 const placement=['center','rail','wall'].includes(inputs.placement)?inputs.placement:d.placement;
 const offset=placement==='center'?0:placement==='rail'?g.rail_half_spacing_in:cabin/2-envelope/2;
 const layout=data.layouts.find(l=>l.id===(inputs.layout??d.layout)&&l.id!=='six-reference')||data.layouts[1];
 const intervals=[[-d.centered_aisle_band_in/2,d.centered_aisle_band_in/2],[-offset-envelope/2,-offset+envelope/2]];
 const aisleOverlap=Math.max(0,Math.min(intervals[0][1],intervals[1][1])-Math.max(intervals[0][0],intervals[1][0]));
 return {layout,cabin,post,envelope,placement,offset,
   deckReachIn:g.deck_width_in/2+offset,
   foundationOutboardReachIn:Math.max(0,offset-g.rail_half_spacing_in),
   aisleOverlapIn:aisleOverlap,
   eccentricMomentLbFt:layout.peak_uniform_static_load_per_post_lb*offset/12,
   fitsCabin:offset+envelope/2<=cabin/2};
}

const C={post:'#86d4c7',roof:'#f49ac9',muted:'#bbb2c4',rail:'#f2c179'};
const n=x=>Number(x).toFixed(1);
const text=(x,y,t,size=13,color=C.muted,anchor='middle')=>`<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${t}</text>`;
const line=(a,b,c,d,color,width=2,extra='')=>`<line x1="${n(a)}" y1="${n(b)}" x2="${n(c)}" y2="${n(d)}" stroke="${color}" stroke-width="${width}" ${extra}/>`;

export function diagram(data,result,view='plan'){
 const g=data.geometry,r=result,l=r.layout;
 let s='<defs><marker id="interior-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#f2c179"/></marker></defs>';
 if(view==='plan'){
   const x=v=>85+(v+g.donor_length_m/2)/g.donor_length_m*830,y=v=>255+v*3;
   s+=`<rect x="85" y="${n(y(-r.cabin/2))}" width="830" height="${n(r.cabin*3)}" rx="25" fill="#37333e" stroke="#82758d" stroke-width="2"/>`;
   s+=`<rect x="115" y="210" width="775" height="90" fill="#86d4c7" fill-opacity=".08" stroke="#86d4c7" stroke-dasharray="6 6"/>`;
   for(const rail of [-1,1])s+=line(105,y(rail*g.rail_half_spacing_in),895,y(rail*g.rail_half_spacing_in),C.rail,2,'stroke-dasharray="9 6"');
   for(const axle of g.axle_x_m){const xx=x(axle);s+=`<rect x="${n(xx-32)}" y="${n(y(-r.cabin/2))}" width="64" height="25" fill="#1d1922"/><rect x="${n(xx-32)}" y="${n(y(r.cabin/2)-25)}" width="64" height="25" fill="#1d1922"/>`;}
   l.x_m.forEach((pos,i)=>{const xx=x(pos),yy=y(-r.offset),size=r.post*3,zone=r.envelope*3;
     s+=`<rect x="${n(xx-zone/2)}" y="${n(yy-zone/2)}" width="${n(zone)}" height="${n(zone)}" fill="#86d4c7" fill-opacity=".18" stroke="#86d4c7" stroke-dasharray="3 3"/><rect x="${n(xx-size/2)}" y="${n(yy-size/2)}" width="${n(size)}" height="${n(size)}" fill="${C.post}"/>`;
     s+=text(xx,yy-zone/2-12,'M'+(i+1),14,C.post);
   });
   s+=text(500,45,'CABIN PLAN · ALL POSTS ARE INDIVIDUAL',15,'#f6f0e6');
   s+=text(500,76,'Diagram proportions adjusted for clarity; furniture, doors and actual wheel housings are not mapped.',12);
   s+=text(500,280,'Centered 30-inch aisle band · layout test only',13);
   s+=text(100,425,'FRONT',12,C.muted,'start')+text(900,425,'REAR',12,C.muted,'end');
   s+=text(500,451,'Dashed amber lines: assumed chassis rails beneath the floor',12,C.rail);
   s+=text(500,477,'Post zones include 1 inch per side for finish/access only; bases, gussets and cabinetry need more space.',11);
 }else if(view==='section'){
   const scale=4,x=v=>500+v*scale,postX=x(-r.offset),half=r.cabin/2;
   s+=`<rect x="${n(x(-half))}" y="170" width="${n(r.cabin*scale)}" height="190" rx="32" fill="#37333e" stroke="#82758d" stroke-width="2"/>`;
   s+=line(x(-g.deck_width_in/2),135,x(g.deck_width_in/2),135,C.roof,7);
   s+=line(x(-g.deck_width_in/2),155,x(g.deck_width_in/2),155,C.roof,3);
   s+=line(postX,155,postX,382,C.post,r.post*scale);
   s+=line(x(-half)+6,351,x(half)-6,351,'#8c8196',2,'stroke-dasharray="5 5"');
   s+=text(x(half)-4,338,'Floor: no support capacity assumed',11,C.muted,'end');
   const bridgeLeft=Math.min(postX,x(-g.rail_half_spacing_in))-18,bridgeRight=Math.max(postX,x(g.rail_half_spacing_in))+18;
   s+=line(bridgeLeft,386,bridgeRight,386,C.post,7);
   for(const rail of [-1,1])s+=`<rect x="${n(x(rail*g.rail_half_spacing_in)-10)}" y="377" width="20" height="35" fill="#19161e" stroke="${C.rail}" stroke-width="2"/>`;
   for(const arrow of [-35,-10,15,40])s+=line(x(arrow),74,x(arrow),122,C.rail,2.5,'marker-end="url(#interior-arrow)"');
   s+=text(500,35,'TRANSVERSE SECTION · SINGLE POST AT THIS LOCATION',15,'#f6f0e6');
   s+=text(500,59,'Roof grillage must spread load and resist unbalanced bending / torsion',12);
   s+=text(x(half)-5,238,'Roof / floor penetrations:',12,C.muted,'end');
   s+=text(x(half)-5,259,'sealing + relative movement',12,C.muted,'end');
   s+=text(500,445,'Foundation connects to chassis. Transfer beam and joints are schematic and unsized.',12);
   s+=text(500,473,'Keep the overhead transfer structure above the roof if the available envelope permits.',12);
 }else{
   const x=v=>85+(v+g.donor_length_m/2)/g.donor_length_m*830;
   s+='<rect x="85" y="200" width="830" height="166" rx="24" fill="#37333e" stroke="#82758d"/>';
   for(const axle of g.axle_x_m)s+=`<circle cx="${n(x(axle))}" cy="365" r="32" fill="#18141d" stroke="#746a7d" stroke-width="3"/>`;
   const left=x(-g.deck_length_m/2),right=x(g.deck_length_m/2),segments=12;
   s+=line(left,153,right,153,C.roof,5)+line(left,103,right,103,C.roof,3);
   for(let i=0;i<segments;i++)s+=line(left+(right-left)*i/segments,i%2?103:153,left+(right-left)*(i+1)/segments,i%2?153:103,C.roof,2);
   l.x_m.forEach((p,i)=>{const xx=x(p);s+=line(xx,153,xx,380,C.post,7)+line(xx-15,380,xx+15,380,C.post,5)+text(xx,418,'M'+(i+1),15,C.post);});
   s+=text(500,43,'INDIVIDUAL INTERIOR POSTS · LONGITUDINAL ROOF FRAME',15,'#f6f0e6');
   s+=text(500,73,'Vertical scale exaggerated: only about 7.9 inches from modeled roof to deck surface.',12);
   const i=l.spans_m.indexOf(l.max_span_m),a=x(l.x_m[i]),b=x(l.x_m[i+1]);
   s+=line(a,450,b,450,C.muted,1)+line(a,443,a,456,C.muted,1)+line(b,443,b,456,C.muted,1)+text((a+b)/2,479,`${n(l.max_span_m/.3048)} ft · longest support span`,13);
   s+=text(500,300,'Bus body shown transparent for explanation',13);
 }
 return `<svg viewBox="0 0 1000 500" role="img" aria-labelledby="interior-title interior-desc"><title id="interior-title">${l.name}: ${view} view, ${r.placement} placement</title><desc id="interior-desc">Individual interior posts. Concept geometry only; no final member sections or load rating. Exact interior layout and chassis attachment access are unknown.</desc>${s}</svg>`;
}
