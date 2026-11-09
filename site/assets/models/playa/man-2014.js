export function buildMan(g,man={x:0,z:0}){
  const color=h=>[h>>16,(h>>8)&255,h&255].map(v=>v/255);
  const tau=Math.PI*2;
  // Slatted timber shells: open gaps between each run of staves.
  const manStart=g.vertices.length;
  const wood=[0xeac18f,0xf1ca9f,0xca9870,0xdbb487].map(color);
  function shell(levels,count){
    const point=([cx,y,rx,rz],a)=>[man.x+cx+rx*Math.cos(a),y,man.z+rz*Math.sin(a)];
    for(let i=0;i<count;i++){
      const a=i*tau/count,b=(i+.81)*tau/count;
      for(let k=1;k<levels.length;k++){
        const lo=levels[k-1],hi=levels[k],p=point(lo,a),q=point(lo,b),r=point(hi,a),s=point(hi,b);
        const c=wood[(i+3*k)%4];g.tri(p,q,r,c);g.tri(q,s,r,c);
      }
    }
  }
  for(const side of [-1,1]){
    const mirror=rows=>rows.map(([x,y,rx,rz])=>[x*side,y,rx,rz]);
    shell(mirror([[3.7,0,1.26,1.65],[2.95,7.65,1.23,1.2],[1.8,15.3,1.55,1.45]]),26);
    shell(mirror([[6.6,13.45,.68,.71],[5.65,18.45,.98,.94],[4.15,24.8,1.23,1.14]]),21);
  }
  shell([[0,14.7,3.45,1.72],[0,18.4,3.0,1.64],[0,23.3,4.0,1.98],[0,25.35,3.7,1.72]],54);
  const height=105*.3048;
  // The lantern head broadens above the neck, with a sloping crown.
  const rows=[[25.35,1.26,1.13],[26.4,1.65,1.35],[29.9,2.14,1.72],[31.05,1.45,1.25],[height,.12,.16]];
  const corner=(row,i)=>[man.x+(i===0||i===3?-1:1)*row[1],row[0],man.z+(i<2?1:-1)*row[2]];
  for(let k=1;k<rows.length;k++)for(let i=0;i<4;i++){
    const a=corner(rows[k-1],i),b=corner(rows[k-1],(i+1)%4),c=corner(rows[k],i),d=corner(rows[k],(i+1)%4);
    const mix=(p,q,t)=>p.map((v,j)=>v+(q[j]-v)*t);
    g.tri(a,b,c,color(0xb49366));g.tri(b,d,c,color(0xbc9d73));
    for(let j=0;j<7;j++)g.beam(mix(a,b,j/7),mix(c,d,j/7),.055,wood[0],4);
    for(let j=0;j<4;j++)g.beam(mix(a,c,j/4),mix(b,d,j/4),.052,wood[1],4);
  }
  for(let y=16;y<24.8;y+=.9)g.beam([man.x-.51,y,man.z+1.9],[man.x+.51,y,man.z+1.9],.12,color(0x8c633f),4);

  // Include the thickness of the crown rails in the published overall height.
  let top=0;
  for(let i=manStart+1;i<g.vertices.length;i+=6)top=Math.max(top,g.vertices[i]);
  for(let i=manStart+1;i<g.vertices.length;i+=6)g.vertices[i]*=height/top;

}
