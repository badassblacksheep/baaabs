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
  const study = compareRoadConfigurations({design, material, frame: recipe.candidate}, revision);
  const {modes, deck} = study;
  const outline = await read(new URL('./donor.json', import.meta.url));
  const datums = [...surveyDatums(recipe.donor), ...outline.map(points => ({layer:'donor', kind:'line', points}))];
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
    if (mode.frameRetained) byId('road-mode').add(new Option(mode.label,id));
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
  draw();
  byId('structure-grid').textContent = 'The candidate has ' + deck.joists + ' transverse joist lines at ' +
    deck.pitchIn + ' in centers, with a modeled clear span of ' + decimal(deck.joistSpanIn,1) +
    ' in. The sheet edge projects ' + decimal(deck.edgeOverhangIn,1) + ' in beyond the outside chord face. Verify edge bearing, hatch trimming and concentrated loads.';
  byId('beam-screen').textContent = 'For an illustrative ' + study.beam.load + ' kN/m on one side bearer, the longest seated span is ' +
    decimal(study.beam.seated.spanIn,1) + ' in (' + decimal(study.beam.seated.momentKNm,2) + ' kN·m, ' + decimal(study.beam.seated.dropMm,2) +
    ' mm deflection). Omit the middle shore on that side and the ideal span becomes ' + decimal(study.beam.unloaded.spanIn,1) + ' in (' +
    decimal(study.beam.unloaded.momentKNm,2) + ' kN·m, ' + decimal(study.beam.unloaded.dropMm,2) + ' mm).';
  byId('sheets').textContent = 'Before hatch cutouts, ' + decimal(deck.plyStock) + ' stock sheets yield ' +
    deck.faces + ' removable faces in two lanes, including a half sheet at opposite ends. Compare this with ' +
    deck.oldFaces + ' individually framed walking surfaces in Rev 07.';
  byId('pieces').textContent = 'Rev 08 replaces the double layer of carriers and ' + deck.oldFaces +
    ' steel cassettes with a fixed joist grid. Two continuous side bearers replace the deep side trusses. ' +
    deck.blocks + ' short longitudinal blocks support the center plywood seam. Relative to the modeled Rev 07 decked kit, this removes about ' +
    decimal(deck.massSavedLb) + ' lb and lowers the walking surface by ' + decimal(deck.heightSavedIn,1) +
    ' in. Hatch frames, restraints, tabs and hardware remain unweighed.';
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
