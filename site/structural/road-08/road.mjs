import {buildBackbone, compareDecks, IN} from '../modular-07/backbone.mjs';

const KG_PER_LB = 0.45359237;
const layers = new Set(['primary', 'shores', 'deck']);

function tubeArea(width, depth, wall) {
  return width * depth - (width - 2 * wall) * (depth - 2 * wall);
}

// The window pitch is measured. Bow phase and load paths at these stations remain provisional.
function shoreStations(frame, pitch, count) {
  if (count === frame.pairs) return [...frame.pairXsM];
  const [front,rear] = frame.portalXsM;
  const phase = frame.pairXsM[Math.floor(frame.pairXsM.length/2)];
  const candidates = [];
  for (let n=Math.floor((front-phase)/pitch)+1; phase+n*pitch<rear-1e-7; n++) {
    candidates.push(phase+n*pitch);
  }
  let best, bestScore;
  function visit(xs, start) {
    if (xs.length === count) {
      const ordered = [front,...xs,rear];
      const gaps = ordered.slice(1).map((x,i)=>x-ordered[i]);
      const target = (rear-front)/gaps.length;
      const score = [Math.max(...gaps), Math.max(...gaps.slice(1).map((g,i)=>g+gaps[i])),
        gaps.reduce((sum,g)=>sum+(g-target)**2,0),
        xs.reduce((sum,x,i)=>sum+(x+xs[count-1-i]-front-rear)**2,0)];
      const different = bestScore ? score.findIndex((v,i)=>Math.abs(v-bestScore[i])>1e-8) : -1;
      if (!bestScore || (different>=0 && score[different]<bestScore[different])) {
        best = [...xs]; bestScore = score;
      }
      return;
    }
    for (let i=start; i<=candidates.length-(count-xs.length); i++) visit([...xs,candidates[i]],i+1);
  }
  visit([],0);
  if (!best) throw Error('Insufficient candidate bow stations for the requested shore count');
  return best;
}

export function compareRoadConfigurations(ctx, revision, pairs=revision.preferredShorePairs) {
  const {design, frame, material} = ctx;
  if (!revision.shorePairTrials.includes(pairs) || !(ctx.donor.pillarPitchIn>0)) throw Error('Invalid shore study inputs');
  const stations = shoreStations(frame, ctx.donor.pillarPitchIn*IN, pairs);
  const selected = compareDecks(ctx).find(format => format.id === design.deck.selected);
  const previous = buildBackbone({...ctx, analysis: {selected}});
  const previousParts = previous.ledger.filter(part => layers.has(part.layer));
  const mass = parts => parts.reduce((sum, part) => sum + part.massKg * part.count, 0);
  const previousFullLb = mass(previousParts) / KG_PER_LB;
  const section = name => frame.members.find(member => member.name === name);
  const chord = section(revision.edgeGirder), joist = section(revision.joistSection), brace = section(revision.planBrace);
  // Reuse the end portals, bearing assemblies and horizontal plan bracing. Intermediate
  // bays have no deep side trusses, lower transverse ties or field-spliced side ladders.
  const keep = item => item.group === 'portal' || item.label.startsWith('Plan diagonal ');
  const steel = previous.items.filter(keep).map(item => ({...item}));
  const keptIds = new Set(steel.map(item => item.label));
  const retained = previousParts.filter(part => keptIds.has(part.id));
  const top = previous.high + chord.depth / 2;
  const joistZ = top - joist.depth / 2;
  const braceZ = top - joist.depth - brace.depth / 2;
  for (const item of steel.filter(item => item.label.startsWith('Plan diagonal '))) {
    item.points = item.points.map(([x,y]) => [x,y,braceZ]);
  }
  const [front, rear] = frame.deckBoundsM;
  const halfSpan = (previous.width - chord.width) / 2;
  const pitch = revision.joistPitchIn * IN, bays = Math.round((rear-front) / pitch);
  const [sheetW, sheetL] = design.deck.stockSheetIn.map(value => value * IN);
  const length = rear-front, half = frame.deckWidthIn*IN/2;
  if (Math.abs(bays*pitch-length)>1e-7 || Math.abs(half-sheetW)>1e-7 ||
      Math.abs(sheetL/(2*pitch)-Math.round(sheetL/(2*pitch)))>1e-7) {
    throw Error('Check joist and sheet layout against the new deck dimensions');
  }
  const [blockWidth,blockDepth,blockWall] = design.deck.frameSectionIn.map(value => value*IN);
  let addedKg = 0;
  function member(label, a, b, area, layer='deck') {
    steel.push({layer, kind:'line', points:[a,b], label});
    addedKg += Math.hypot(...a.map((value,i)=>value-b[i])) * area * material.densityKgM3;
  }
  const nominalArea = s => tubeArea(s.width,s.depth,s.wall/material.designWallFactor);
  for(const y of [-previous.width/2, previous.width/2]) {
    member('Continuous side bearer', [front,y,previous.high], [rear,y,previous.high], nominalArea(chord), 'primary');
  }
  const shore = frame.shoreGeometry;
  const postArea = tubeArea(shore.tubeWidthM,shore.tubeWidthM,shore.tubeWallM);
  const bearingZ = top - chord.depth;
  const postLocations = stations.flatMap(x=>[-previous.width/2,previous.width/2].map(y=>[x,y]));
  for (const [i,[x,y]] of postLocations.entries()) {
    const [baseLength,baseWidth] = shore.bottomPlateM;
    steel.push({layer:'shores',kind:'box',label:'Provisional body landing',
      points:[[x-baseLength/2,y-baseWidth/2,shore.landingM-shore.padThicknessM],[x+baseLength/2,y+baseWidth/2,shore.landingM]]});
    const [padLength,padWidth] = shore.topPlateM;
    const topOfPost = bearingZ - shore.padThicknessM;
    steel.push({layer:'shores', kind:'box', label:'Upper bearing plate',
      points:[[x-padLength/2,y-padWidth/2,topOfPost],[x+padLength/2,y+padWidth/2,bearingZ]]});
    member('Body shore '+(i+1), [x,y,shore.landingM], [x,y,topOfPost], postArea, 'shores');
    const area = ([l,w]) => l*w;
    addedKg += (area(shore.topPlateM)+area(shore.bottomPlateM))*shore.padThicknessM*material.densityKgM3;
  }
  const joistArea = tubeArea(joist.width,joist.depth,joist.wall/material.designWallFactor);
  const blockArea = tubeArea(blockWidth,blockDepth,blockWall);
  for (let i=0; i<=bays; i++) {
    const x = front+i*pitch;
    member('Transverse floor joist '+(i+1), [x,-halfSpan,joistZ], [x,halfSpan,joistZ], joistArea);
    if (i<bays) {
      const z=top-blockDepth/2;
      member('Center seam block '+(i+1), [x+joist.width/2,0,z], [x+pitch-joist.width/2,0,z], blockArea);
    }
  }
  const faces = [], surface = top + design.deck.plyThicknessIn * IN;
  // The marked panel strength axis must run fore-aft across the transverse joists.
  for (const [lane,y] of [-half,0].entries()) {
    let x = front;
    while (x < rear-1e-7) {
      const end = Math.min(rear, x + (lane===1 && x===front ? sheetL/2 : sheetL));
      faces.push({layer:'deck', kind:'polygon', label:'Plywood face '+(faces.length+1), face:true,
        points:[[x,y,surface],[end,y,surface],[end,y+half,surface],[x,y+half,surface]]});
      x=end;
    }
  }
  const areaFt2 = frame.deckLengthIn * frame.deckWidthIn / 144;
  const plywoodLb = areaFt2 * design.deck.plyLbFt2;
  const steelLb = (mass(retained)+addedKg) / KG_PER_LB;
  const modes = {
    packed: {label:'Rev 07 packed', items:[], installedLb:0, topIn:null, facesToFit:0, frameRetained:false},
    open: {label:'Rev 08 open grid', items:steel, installedLb:steelLb, topIn:top/IN, facesToFit:faces.length, frameRetained:true},
    decked: {label:'Rev 08 plywood fitted', items:[...steel,...faces], installedLb:steelLb+plywoodLb,
      topIn:surface/IN, facesToFit:0, frameRetained:true}
  };
  const deck = {joists:bays+1, blocks:bays, faces:faces.length, plyStock:areaFt2/(sheetW*sheetL/0.3048**2),
    joistSpanIn:2*halfSpan/IN, edgeOverhangIn:(half-(previous.width+chord.width)/2)/IN,
    heightSavedIn:(previous.deckTop-surface)/IN, massSavedLb:previousFullLb-modes.decked.installedLb,
    oldFaces:selected.count, fullFaceAreaM2:sheetW*sheetL, previousFullLb, pitchIn:revision.joistPitchIn};
  // This is an ideal isolated simple span at unit line load, not a model of body/vehicle stiffness.
  const supports = [frame.portalXsM[0], ...stations, frame.portalXsM[1]];
  const longestSpan = xs => Math.max(...xs.slice(1).map((x,i) => x-xs[i]));
  const inertia = (chord.width*chord.depth**3-(chord.width-2*chord.wall)*(chord.depth-2*chord.wall)**3)/12;
  const load = revision.beamScreenLineLoadKNm;
  function beamScreen(span) {
    return {spanIn:span/IN, momentKNm:load*span**2/8,
      dropMm:5*(load*1000)*span**4/(384*material.elasticModulusGPa*1e9*inertia)*1000};
  }
  const maxWithoutShore = Math.max(...stations.map(x=>longestSpan(supports.filter(station=>station!==x))));
  return {modes, deck, plywoodLb, areaFt2, stationsIn:stations.map(x=>x/IN),
    beam:{load, seated:beamScreen(longestSpan(supports)), unloaded:beamScreen(maxWithoutShore)}};
}

// Plot only surveyed longitudinal stations. The exterior body and fittings await measurement.
export function surveyDatums(donor) {
  const datums = [[0, 'Front bumper'], [donor.frontAxleIn, 'Front axle'],
    [donor.rearAxleIn, 'Rear axle'], [donor.lengthIn, 'Rear bumper']];
  return [{layer: 'donor', kind: 'line', points: [[0,0,0],[donor.lengthIn*IN,0,0]], guide: true},
    ...datums.map(([inch, label]) => ({
      layer: 'donor', kind: 'line', label, caption: true, points: [[inch*IN,0,0], [inch*IN,0,-0.2]]
    }))];
}
