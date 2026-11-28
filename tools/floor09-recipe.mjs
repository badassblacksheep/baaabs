// One geometry recipe for the structural viewer, installed GLB and its derived views.
import {readFileSync} from 'node:fs';
import {foldingFloor,floorAssembly} from '../site/structural/floor-09/floor.mjs';
import {IN} from '../site/structural/modular-07/backbone.mjs';

const base=new URL('../site/structural/modular-07/',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,base),'utf8'));
const design=read('design.json'),recipe=read(design.inputs.recipe);
const shape=read('../floor-09/design.json');
const study=foldingFloor({design,frame:recipe.candidate,donor:recipe.donor,material:read(design.inputs.material)},
  read(new URL(shape.baseline,new URL('../floor-09/',base))),shape);
const {layout}=study;
function parts(degrees) {
  return floorAssembly(study,degrees,true).map(item=>{
    const moving=item.layer==='wing';
    const pose=item.pose ?? (moving?(degrees===0?'folded':'event'):item.layer==='guard'?'event':'fixed');
    const section=item.layer==='guard'?Array(2).fill(shape.supportDisplay.guardTubeIn*IN):item.section;
    if(item.kind==='line' && !section) throw Error('Missing member section for '+item.label);
    return {...item,section,pose};
  });
}
console.log(JSON.stringify({revision:shape.revision,surface:layout.surface,thickness:layout.thickness,
  parts:[...parts(90),...parts(0).filter(i=>i.pose==='folded')]}));
