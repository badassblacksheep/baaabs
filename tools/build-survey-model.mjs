// Generate the survey-informed, provisional frame recipe without altering iteration 06.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
function derive(survey, source) {
  const inch=.0254, m=Object.fromEntries(survey.measurements.map(v=>[v.id,v]));
  const length=m["EXT-001"].nominal, wheelbase=m["EXT-002"].value, front=m["EXT-004"].value, rear=length-front-wheelbase;
  const pitch=m["INT-006"].value, pairPitch=4*pitch;
  const v=source.variants.find(v=>v.id===source.selected)||source.variants.find(v=>v.id==="six-shores");
  const girder=v.members.find(m=>m.name==="Deck edge girder");
  const oldDeck=[girder.a[0],girder.b[0]];
  const oldPortals=[v.members.find(m=>m.name==="Front corner post").a[0],v.members.find(m=>m.rear&&m.name.endsWith("Front corner post")).a[0]];
  const oldPairs=[...new Set(v.shorePositions.map(p=>p[0]))].sort((a,b)=>a-b);
  const originalDeckIn=Math.round((oldDeck[1]-oldDeck[0])/inch), widthIn=96;
  // Candidate only: fit the largest whole-foot deck within the nominal bumper envelope.
  // Centering and inherited portal edge setbacks are explicit visualization/solver assumptions.
  const candidateIn=Math.floor(length/12)*12;
  const start=(length-candidateIn)/2*inch, end=start+candidateIn*inch;
  const newPortals=[start+oldPortals[0]-oldDeck[0],end-(oldDeck[1]-oldPortals[1])];
  const center=(newPortals[0]+newPortals[1])/2;
  const newPairs=[center-pairPitch*inch,center,center+pairPitch*inch];
  const oldAnchors=[oldDeck[0],oldPortals[0],...oldPairs,oldPortals[1],oldDeck[1]];
  const newAnchors=[start,newPortals[0],...newPairs,newPortals[1],end];
  if(!newAnchors.every((x,i)=>i===0||x>newAnchors[i-1]))throw Error("Candidate anchors do not fit");
  function mapX(x) {
    let i=0;while(i<oldAnchors.length-2&&x>oldAnchors[i+1])i++;
    return newAnchors[i]+(x-oldAnchors[i])/(oldAnchors[i+1]-oldAnchors[i])*(newAnchors[i+1]-newAnchors[i]);
  }
  const point=p=>[mapX(p[0]),p[1],p[2]];
  const members=v.members.map(m=>({...m,a:point(m.a),b:point(m.b)}));
  const shorePositions=v.shorePositions.map(point);
  const joists=members.filter(m=>m.deck_joist??m.name.startsWith("Floor joist")).map(m=>m.a[0]).sort((a,b)=>a-b);
  const maxJoistGap=Math.max(...joists.slice(1).map((x,i)=>(x-joists[i])/inch));
  if(maxJoistGap>24.0001)throw Error("Candidate exceeds 24-inch modeled joist spacing: "+maxJoistGap);
  const totalLength=ms=>ms.reduce((sum,m)=>sum+Math.hypot(...m.a.map((x,i)=>m.b[i]-x)),0);
  const alternatives=[candidateIn,432,originalDeckIn].map(n=>({deckLengthIn:n,deckWidthIn:widthIn,grossAreaFt2:n*widthIn/144,deltaFromBusIn:n-length,areaChangePct:100*(n-originalDeckIn)/originalDeckIn,nominalCenteredEndProjectionIn:(n-length)/2}));
  return {revision:"survey-candidate-07",surveyDate:survey.survey_date,qualification:"Conceptual frame geometry only. Not a released design, measured support map, or verified structural capacity.",coordinates:"Metres; x=0 at front bumper, positive rearward; y,z retained from iteration 06 assumed axes. Interior floor elevations relative to frame unknown.",donor:{lengthIn:length,observedLengthRangeIn:m["EXT-001"].range,roofCenterlineIn:m["EXT-005"].value,frontAxleIn:front,rearAxleIn:front+wheelbase,wheelbaseIn:wheelbase,rearOverhangNominalIn:rear,rearOverhangMeasuredIn:m["EXT-003"].value,aisleIn:m["INT-001"].value,floorWidthIn:m["INT-002"].value,crownIn:m["INT-003"].value,wallIn:m["INT-004"].value,ceilingRiseIn:m["INT-003"].value-m["INT-004"].value,pillarPitchIn:pitch},alternatives,assumptions:["Candidate is not an owner-approved replacement for the 38-foot deck. Centered on nominal bumper envelope; bumper fit is not roof or portal fit.","Preserve iteration 06 front/rear deck-to-portal offsets, all y/z coordinates, material dimensions and six shore plate/tube assumptions. Real chassis seats, body bows, exterior envelope and clearance remain unmeasured.","Center three shore pairs between candidate portals at four measured pillar pitches; absolute phase is not verified.","Piecewise longitudinal remesh preserves topology and member sections. Does not rebuild the donor GLB, skin, panel layouts or transport configuration."],baseline:{deckLengthIn:originalDeckIn,totalMemberLengthM:totalLength(v.members)},candidate:{...v,deckLengthIn:candidateIn,deckWidthIn:widthIn,deckBoundsM:[start,end],portalXsM:newPortals,pairXsM:newPairs,pairPitchIn:pairPitch,maxJoistGapIn:maxJoistGap,totalMemberLengthM:totalLength(members),members,shorePositions},loadInputs:{panelAllowanceLbf:source.panelAllowanceLbf,people:20,personLbf:225,gearLbf:250,liveMultiplier:2,shoreK_LbfPerIn:5000,stressScreenMPa:207}};
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const output=JSON.stringify(derive(read('site/survey-results/measurements.json'),read('site/assets/structural-models-06.json')),null,2)+'\n';
const destination=path.join(root,'site/assets/earl-survey-model.json');
if(process.argv.includes('--check')){if(fs.readFileSync(destination,'utf8')!==output)throw Error('Survey frame recipe is stale; run node tools/build-survey-model.mjs --write');}else if(process.argv.includes('--write'))fs.writeFileSync(destination,output);else throw Error('Specify --write or --check');
