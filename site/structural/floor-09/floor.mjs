import {IN} from '../modular-07/backbone.mjs';
import {compareRoadConfigurations} from '../road-08/road.mjs';
import {wingGeometry} from './wings.mjs';

export function foldingFloor(ctx,rev8,shape) {
  const base=compareRoadConfigurations(ctx,rev8);
  const {design,frame,material}=ctx;
  const [front,rear]=frame.deckBoundsM;
  const half=frame.deckWidthIn*IN/2, pitch=rev8.joistPitchIn*IN;
  const tongueHalf=shape.tongueWidthIn*IN/2, shoulder=front+shape.tongueBays*pitch;
  const [tubeWidth,tubeDepth,wall]=design.deck.frameSectionIn.map(v=>v*IN);
  const [stockWidth,leafLength]=design.deck.stockSheetIn.map(v=>v*IN);
  const surface=base.modes.decked.topIn*IN,thickness=design.deck.plyThicknessIn*IN;
  const layout={begin:front+shape.wingStartBay*pitch,end:rear-shape.wingEndInsetBays*pitch,
    half,surface,reach:shape.wingProjectionIn*IN,pitch,leafLength,thickness,tubeDepth};
  const leavesPerSide=Math.round((layout.end-layout.begin)/leafLength);
  if(!(tongueHalf>0 && tongueHalf<half && front<shoulder && shoulder<=layout.begin &&
      layout.end<=rear && layout.reach>0 && layout.reach<=stockWidth && leavesPerSide>0 &&
      Math.abs(leavesPerSide*leafLength-layout.end+layout.begin)<1e-7)) throw Error('Invalid footprint');
  const blankFaces=base.modes.decked.items.filter(i=>i.face);
  const fixedFaces=[];
  function face(a,b,y0,y1) {
    fixedFaces.push({layer:'deck',kind:'polygon',face:true,label:'Fixed plywood '+(fixedFaces.length+1),
      points:[[a,y0,surface],[b,y0,surface],[b,y1,surface],[a,y1,surface]]});
  }
  for(const sheet of blankFaces) {
    const [[a,y0],[b],[,y1]]=sheet.points;
    if(a<shoulder) face(a,Math.min(shoulder,b),Math.max(y0,-tongueHalf),Math.min(y1,tongueHalf));
    if(b>shoulder) face(Math.max(a,shoulder),b,y0,y1);
  }
  const joist=frame.members.find(m=>m.name===rev8.joistSection);
  const z=surface-thickness-tubeDepth/2;
  const trimmers=[-tongueHalf,tongueHalf].map(y=>({layer:'deck',kind:'line',label:'Tongue edge support',
    points:[[front+joist.width/2,y,z],[shoulder-joist.width/2,y,z]]}));
  const folded=wingGeometry(layout,0,false);
  const tubeArea=tubeWidth*tubeDepth-(tubeWidth-2*wall)*(tubeDepth-2*wall);
  const length=items=>items.reduce((sum,i)=>sum+Math.hypot(...i.points[0].map((v,j)=>v-i.points[1][j])),0);
  const lbPerM=tubeArea*material.densityKgM3/0.45359237;
  const fixedArea=base.areaFt2-2*(half-tongueHalf)*(shoulder-front)/0.3048**2;
  const wingArea=2*(layout.end-layout.begin)*layout.reach/0.3048**2;
  const steelLb=base.modes.open.installedLb+length([...trimmers,...folded])*lbPerM;
  const deckedLb=steelLb+(fixedArea+wingArea)*design.deck.plyLbFt2;
  return {base,layout,trimmers,fixedFaces,leavesPerSide,fixedArea,wingArea,steelLb,deckedLb,
    wingFrameLb:length(folded)*lbPerM,wingPlyLb:wingArea*design.deck.plyLbFt2,
    stockCore:base.deck.plyStock,stockWings:Math.ceil(2*leavesPerSide/Math.floor(stockWidth/layout.reach+1e-8))};
}
