import {compareRoadConfigurations, surveyDatums} from './road.mjs';
import {createViewer} from '../modular-07/viewer.mjs';

const byId = id => document.getElementById(id);
const decimal = (value, places = 0) => value.toLocaleString('en-US', {maximumFractionDigits: places});
function elevation(inches) {
  const tenths = Math.round(inches*10);
  return Math.floor(tenths/120) + ' ft ' + decimal(tenths%120/10,1) + ' in';
}
async function read(url) {
  const res = await fetch(url);
  if (!res.ok) throw Error('Could not load ' + new URL(url).pathname);
  return res.json();
}
async function run() {
  const base = new URL('../modular-07/design.json', import.meta.url);
  const design = await read(base);
  const [recipe, material, revision] = await Promise.all([
    read(new URL(design.inputs.recipe,base)), read(new URL(design.inputs.material,base)), read(new URL('./design.json',import.meta.url))
  ]);
  const ctx = {design, material, frame:recipe.candidate, donor:recipe.donor};
  const trials = new Map(revision.shorePairTrials.map(pairs => [pairs,compareRoadConfigurations(ctx,revision,pairs)]));
  let study = trials.get(revision.preferredShorePairs), modes = study.modes;
  const deck = study.deck;
  const select = byId('shore-pairs');
  for (const [pairs, trial] of trials) {
    select.add(new Option(pairs + ' pairs · ' + (2*pairs) + ' shores', pairs));
    const row=byId('shore-trials').insertRow();
    const name=document.createElement('th');
    name.scope='row';
    name.textContent=pairs+' pairs'+(pairs===revision.preferredShorePairs?' · baseline':'');
    row.append(name);
    for (const value of [decimal(trial.beam.seated.spanIn,1)+' in',decimal(trial.beam.unloaded.spanIn,1)+' in',
      decimal(trial.beam.seated.dropMm,2)+' mm',decimal(trial.modes.decked.installedLb)+' lb']) row.insertCell().textContent=value;
  }
  select.value = String(revision.preferredShorePairs);
  const outline = await read(new URL('./donor.json', import.meta.url));
  const datums = [...surveyDatums(recipe.donor), ...outline.map(points => ({layer:'donor', kind:'line', points}))];
  for(const [id,mode] of Object.entries(modes)) {
    if(mode.frameRetained) byId('road-mode').add(new Option(mode.label,id));
  }
  function updateComparison() {
    byId('comparison').replaceChildren();
    for (const [id, mode] of Object.entries(modes)) {
      const row = byId('comparison').insertRow();
      const title = document.createElement('th');
      title.scope = 'row';
      title.textContent = mode.label;
      row.append(title);
      const installation = mode.frameRetained ? 'Inspect retained steel' : 'Erect steel and fit complete cassettes';
      for (const value of [decimal(mode.installedLb) + ' lb', mode.topIn === null ? 'Deck stowed' : elevation(mode.topIn),
        installation, id === 'packed' ? 'Travel on packed cassettes' : mode.facesToFit + ' faces']) {
        row.insertCell().textContent = value;
      }
    }
  }
  const viewer = createViewer(byId('viewport'), () => {});
  let underside = false;
  const visible = new Set(['primary', 'shores', 'deck', 'donor']);
  function draw() {
    const mode = modes[byId('road-mode').value];
    const items = underside ? mode.items.filter(item => item.layer === 'deck' || item.layer === 'primary') : [...datums, ...mode.items];
    viewer.setScene(items, visible, {mode:'road', nodes:[], label:'Front bumper datum · rearward along Earl'});
    byId('scene-note').textContent = mode.label + ' · Modeled deck top ' + elevation(mode.topIn) +
      '. Blue marks the direct-bearing joists, seam blocks and plywood. Orange marks compression shores. ' + (underside ? 'Bus and shores hidden to expose the underside.' : 'Gray outlines show Earl’s fitted donor model. Exterior contours still need measurement.');
  }
  byId('road-mode').onchange = draw;
  byId('reset').onclick = () => { underside = false; draw(); viewer.reset(); };
  for (const button of document.querySelectorAll('[data-angle]')) button.onclick = () => {
    underside = button.dataset.angle === 'underside';
    draw();
    viewer.angle(button.dataset.angle);
  };
  byId('road-mode').value = 'decked';
  updateComparison();
  draw();
  byId('structure-grid').textContent = 'The candidate has ' + deck.joists + ' transverse joist lines at ' +
    deck.pitchIn + ' in centers, with a modeled clear span of ' + decimal(deck.joistSpanIn,1) +
    ' in. The sheet edge projects ' + decimal(deck.edgeOverhangIn,1) + ' in beyond the outside chord face. Verify edge bearing, hatch trimming and concentrated loads.';
  byId('sheets').textContent = 'Before hatch cutouts, ' + decimal(deck.plyStock) + ' stock sheets yield ' +
    deck.faces + ' removable faces in two lanes, including a half sheet at opposite ends. Compare this with ' +
    deck.oldFaces + ' individually framed walking surfaces in Rev 07.';
  function reportShoring() {
    byId('shore-stations').textContent = 'Selected pair centers in inches aft of Earl’s front bumper: ' +
      study.stationsIn.map(x=>decimal(x,1)).join(' · ') + '. The end portals are additional supports. Every landing is provisional.';
    byId('beam-screen').textContent = 'For an illustrative ' + study.beam.load + ' kN/m on one side bearer, the longest seated span is ' +
      decimal(study.beam.seated.spanIn,1) + ' in (' + decimal(study.beam.seated.momentKNm,2) + ' kN·m, ' + decimal(study.beam.seated.dropMm,2) +
      ' mm deflection). Omit the most consequential single shore on that side and the ideal span becomes ' + decimal(study.beam.unloaded.spanIn,1) + ' in (' +
      decimal(study.beam.unloaded.momentKNm,2) + ' kN·m, ' + decimal(study.beam.unloaded.dropMm,2) + ' mm).';
    byId('pieces').textContent = 'Rev 08 replaces the double layer of carriers and ' + deck.oldFaces +
      ' steel cassettes with a fixed joist grid. Two continuous side bearers replace the deep side trusses. ' +
      deck.blocks + ' short longitudinal blocks support the center plywood seam. Relative to the modeled Rev 07 decked kit, this removes about ' +
      decimal(study.deck.massSavedLb) + ' lb and lowers the walking surface by ' + decimal(deck.heightSavedIn,1) +
      ' in. Hatch frames, restraints, tabs and hardware remain unweighed.';
  }
  select.onchange = () => {
    study=trials.get(Number(select.value));
    modes=study.modes;
    // The sheet layout remains identical; the steel mass follows the selected shore layout.
    updateComparison(); reportShoring(); draw();
  };
  reportShoring();
  byId('plywood').textContent = 'Keeping the plywood on moves about ' + decimal(study.plywoodLb) +
    ' lb onto the elevated floor over ' + decimal(study.areaFt2) + ' ft². If the faces travel inside Earl, total vehicle weight still includes them.';
  byId('time-benefit').textContent = 'With plywood fitted, the current layout also avoids ' + deck.faces +
    ' plywood placements at build and ' + deck.faces + ' removals at strike, compared with transporting the faces separately. These counts assume an uncut floor. Hatch openings may change them. Both cases still need a hands-on arrival inspection.';
  const pressure = byId('pressure');
  for (const value of design.windStudy.netPressuresKPa) pressure.add(new Option(decimal(value,2) + ' kPa', value));
  function wind() {
    const kPa = Number(pressure.value);
    byId('wind-force').textContent = decimal(kPa * study.areaFt2 * 0.3048 ** 2, 1) + ' kN across the deck · ' +
      decimal(kPa * deck.fullFaceAreaM2, 2) + ' kN on one full stock sheet.';
  }
  pressure.onchange = wind;
  wind();
}
run().catch(error => { byId('scene-note').textContent = error.message + '. The transport and rehearsal plans are below.'; });
