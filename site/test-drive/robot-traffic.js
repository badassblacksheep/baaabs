// Sample a closed Catmull-Rom path once, then move in metres along it.
const waypoints=[[-19,-9],[-46,2],[-58,-33],[-46,-82],[-4,-111],[48,-107],[56,-70],[32,-45],[37,-13],[12,8]];
const points=[];
for(let i=0;i<waypoints.length;i++){
  const at=k=>waypoints[(i+k+waypoints.length)%waypoints.length];
  const a=at(-1),b=at(0),c=at(1),d=at(2);
  for(let j=0;j<56;j++){
    const t=j/56;
    points.push(b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t)));
  }
}
const edges=points.map(([x,z],i)=>{
  const end=points[(i+1)%points.length],dx=end[0]-x,dz=end[1]-z;
  return {x,z,dx,dz,length:Math.hypot(dx,dz),yaw:Math.atan2(dx,-dz)};
});
function pose(i,offset){
  const e=edges[i],fraction=offset/e.length;
  return {i,offset,x:e.x+e.dx*fraction,z:e.z+e.dz*fraction,yaw:e.yaw};
}
export const spawnRobot=()=>pose(0,0);
// Bound the turning vehicles with discs so even their outside corners stay apart.
export function approachesPlayer(robot,earl,nextRobot=robot,nextEarl=earl,margin=0){
  const dx=robot.x-earl.x,dz=robot.z-earl.z;
  const vx=nextRobot.x-nextEarl.x-dx,vz=nextRobot.z-nextEarl.z-dz;
  const vv=vx*vx+vz*vz;
  const t=vv?Math.min(1,Math.max(0,-(dx*vx+dz*vz)/vv)):0;
  return t>0&&Math.hypot(dx+t*vx,dz+t*vz)<16+margin;
}
export function advanceRobot(robot,earl,dt){
  let i=robot.i,offset=robot.offset+dt*2.2352; // Exactly 5 mph along the route.
  while(offset>=edges[i].length){offset-=edges[i].length;i=(i+1)%edges.length;}
  const next=pose(i,offset);
  return approachesPlayer(robot,earl,next,earl,1.5)?robot:next;
}
