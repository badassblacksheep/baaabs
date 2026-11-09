// Coordinates are metres, with +Y up. Heights come from the Burning Man annual
// report (2014) and the Journal's 2019 Head Maze description. Other dimensions
// are visual estimates from Eric Cheng's 2014 photo and Schultz's front view.
export const art=[
  {name:'Event Horizon',credit:'Ben Bartlett · 2025',url:'https://www.eventhorizon.art/',x:3,z:-24,footprint:3.8,orbit:14},
  {name:'Head Maze',credit:'Matt Schultz & The Pier Group · 2019',url:'https://www.mattschultzart.com/artwork/headmaze',x:-18,z:-59,footprint:6.4,orbit:17},
  {name:'The Man',credit:'Caravansary · 2014 · 105 ft',url:'https://annualreport2014.burningman.org/the-burning-man-event-in-black-rock-city/',x:20,z:-94,footprint:7.5,orbit:21}
];
export const targets=art.flatMap((piece,i)=>[.95,.05,-.85].map(angle=>({
  x:piece.x+piece.orbit*Math.cos(angle),z:piece.z+piece.orbit*Math.sin(angle),angle,art:i
})));
export const obstacles=art;
export function partyAlignment(state,piece){
  const dx=state.x-piece.x,dz=state.z-piece.z;
  return (dx*Math.cos(state.yaw)+dz*Math.sin(state.yaw))/(Math.hypot(dx,dz)||1);
}
// Rounded footprint of Earl, with an oriented central segment between bumpers.
export function clearance(x,z,yaw,piece){
  const dx=piece.x-x,dz=piece.z-z;
  const along=Math.max(-6.1,Math.min(6.1,dx*Math.sin(yaw)-dz*Math.cos(yaw)));
  return Math.hypot(dx-along*Math.sin(yaw),dz+along*Math.cos(yaw))-piece.footprint-1.65;
}
