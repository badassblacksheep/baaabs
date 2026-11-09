export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>mul(a,1/(Math.hypot(...a)||1));
export const rgb=h=>[h>>16,(h>>8)&255,h&255].map(x=>x/255);
export class Geometry {
  vertices=[];
  tri(a,b,c,color,lit=true){
    const n=unit(cross(sub(b,a),sub(c,a)));
    const light=lit?.55+.28*Math.abs(n[1])+.17*Math.abs(n[0]*.8+n[2]*.6):1;
    for(const p of [a,b,c]) this.vertices.push(...p,...mul(color,light));
  }
  beam(a,b,r,color,sides=6){
    const axis=unit(sub(b,a)), u=unit(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])), v=cross(axis,u);
    const rim=i=>add(mul(u,r*Math.cos(i*2*Math.PI/sides)),mul(v,r*Math.sin(i*2*Math.PI/sides)));
    for(let i=0;i<sides;i++){
      const p=rim(i),q=rim(i+1);
      this.tri(add(a,p),add(a,q),add(b,q),color);this.tri(add(a,p),add(b,q),add(b,p),color);
      this.tri(b,add(b,p),add(b,q),color);
    }
  }
}
