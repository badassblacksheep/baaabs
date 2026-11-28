import {IN} from '../modular-07/backbone.mjs';
import {compareRoadConfigurations} from '../road-08/road.mjs';
import {wingGeometry} from './wings.mjs';

export function foldingFloor(ctx,rev8,shape) {
  const base=compareRoadConfigurations(ctx,rev8);
  const {design,frame,material}=ctx;
  const [front,rear]=frame.deckBoundsM;
  const half=frame.deckWidthIn*IN/2, pitch=rev8.joistPitchIn*IN;
  const [tubeWidth,tubeDepth,wall]=design.deck.frameSectionIn.map(v=>v*IN);
  const [stockWidth,leafLength]=design.deck.stockSheetIn.map(v=>v*IN);
  const surface=base.modes.decked.topIn*IN,thickness=design.deck.plyThicknessIn*IN;
  const layout={front,rear,guard:shape.guard,begin:front+shape.wingStartBay*pitch,end:rear-shape.wingEndInsetBays*pitch,
    half,surface,reach:shape.wingProjectionIn*IN,pitch,leafLength,thickness,tubeDepth};
  const leavesPerSide=Math.round((layout.end-layout.begin)/leafLength);
  if(!(front<=layout.begin &&
      layout.end<=rear && layout.reach>0 && layout.reach<=stockWidth && leavesPerSide>0 &&
      Math.abs(leavesPerSide*leafLength-layout.end+layout.begin)<1e-7)) throw Error('Invalid footprint');
  const folded=wingGeometry(layout,0,false);
  const tubeArea=tubeWidth*tubeDepth-(tubeWidth-2*wall)*(tubeDepth-2*wall);
  const length=items=>items.reduce((sum,i)=>sum+Math.hypot(...i.points[0].map((v,j)=>v-i.points[1][j])),0);
  const lbPerM=tubeArea*material.densityKgM3/0.45359237;
  const fixedArea=base.areaFt2;
  const wingArea=2*(layout.end-layout.begin)*layout.reach/0.3048**2;
  const wingFrameLb=length(folded)*lbPerM;
  const steelLb=base.modes.open.installedLb+wingFrameLb;
  const deckedLb=steelLb+(fixedArea+wingArea)*design.deck.plyLbFt2;
  return {base,layout,leavesPerSide,fixedArea,wingArea,steelLb,deckedLb,
    wingFrameLb,wingPlyLb:wingArea*design.deck.plyLbFt2,
    stockCore:base.deck.plyStock,stockWings:Math.ceil(2*leavesPerSide/Math.floor(stockWidth/layout.reach+1e-8))};
}
