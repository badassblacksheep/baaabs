// The register is in workshop metres. Rev 07 uses metres from the surveyed front bumper.
import {IN} from "./backbone.mjs";

const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const sameCorner = (a, b) => distance(a, b) < 1e-6;

function packingBox(points, thickness) {
  return [0, 1, 2].map(axis => {
    const values = points.map(p => p[axis]);
    return Math.max(...values) - Math.min(...values) + thickness;
  });
}

// A crown strip has a front and rear edge. Each edge runs from the dance floor
// side toward the flank. Recover those corners from the current physical sheet.
function ends(sheet) {
  if (!sheet || sheet.points.length !== 4) throw Error("Expected a registered four-corner crown sheet");
  const byX = [...sheet.points].sort((a, b) => a[0] - b[0]);
  return [byX.slice(0, 2), byX.slice(2)].map(pair => pair.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1])));
}

export function buildShell(ctx, nodes) {
  const {panels, shellConfig: datums, design: {shell}} = ctx;
  if (datums.surveyDate !== panels.survey_date) throw Error("Shell datum and registered panel survey differ");
  const local = ([x, y, z]) => [x - datums.frontBumperWorldXM, y, z];
  const sheets = new Map(panels.pieces.map(p => [p.id, {
    layer: "skin", kind: "polygon", points: p.vertices_m.map(local),
    holes: p.holes_m.map(loop => loop.map(local)), label: p.id + " · " + p.name,
    panelId: p.id,
  }]));
  const items = [...sheets.values()];
  const special = panels.special_items.find(i => i.id === datums.frameId && i.component === "dj_rim");
  if (!special) throw Error("Could not locate registered DJ trim");
  for (const face of datums.rimFacesWorldM) {
    items.push({layer: "skin", kind: "polygon", points: face.map(local), label: special.id + " · " + special.name, panelId: special.id});
  }
  const cargo = [], traces = [];
  function line(a, b, label, guide = false) {
    items.push({layer: "panels", kind: "line", points: [a, b], label, guide});
  }
  // Removable straight rails pack along their length. Bents retain their shape.
  function rail(a, b, label) {
    line(a, b, label);
    cargo.push({layer: "panels", id: label, sizeM: [distance(a, b) + shell.stockEnvelopeM,
      shell.stockEnvelopeM, shell.stockEnvelopeM], count: 1});
  }

  for (const run of shell.runs) {
    const upperNodes = nodes.filter(n => n.classId === "panel" && n.side === run.side && n.level === "upper");
    if (!upperNodes.length) throw Error("Missing upper panel nodes on " + run.side);
    const inboard = ([x, y, z]) => [x, y - Math.sign(y) * shell.inwardOffsetM, z];
    const crown = run.crownPanelIds.map(id => ends(sheets.get(id)));
    // Skin coordinates own the seam pattern. Select the attachment station
    // independently for each seam; a different truss length may change pairing.
    const seams = [crown[0][0], ...crown.map(e => e[1])];
    const bays = seams.map(([innerFace, outerFace], j) => {
      if (j < crown.length && (!sameCorner(innerFace, crown[j][0][0]) || !sameCorner(outerFace, crown[j][0][1]))) {
        throw Error("Crown pickup run contains a discontinuous sheet edge");
      }
      const ix = Math.min(j, crown.length - 1), sheetId = run.crownPanelIds[ix];
      const upper = upperNodes.reduce((best, n) =>
        Math.abs(n.positionM[0] - innerFace[0]) < Math.abs(best.positionM[0] - innerFace[0]) ? n : best);
      const lower = nodes.find(n => n.classId === "panel" && n.side === run.side
        && n.station === upper.station && n.level === "lower");
      if (!lower) throw Error("Missing paired lower panel interface at " + upper.id);
      const inner = inboard(innerFace), outer = inboard(outerFace);
      const a = upper.positionM, b = lower.positionM;
      const label = run.side + " crown bent " + (j + 1);
      // Move the upper root out under the cassette lip before any member rises.
      // The candidate centerlines still require full-scale interference checks.
      const elbow = [a[0], Math.sign(a[1]) * (ctx.frame.deckWidthIn * IN / 2 + shell.stockEnvelopeM / 2), a[2]];
      line(a, elbow, label);
      line(b, elbow, label);
      line(b, outer, label);
      line(elbow, outer, label);
      line(elbow, inner, label);
      line(inner, outer, label);
      line(inner, innerFace, sheetId + " · inner tab datum", true);
      line(outer, outerFace, sheetId + " · outer tab datum", true);
      cargo.push({layer: "panels", id: label, sizeM: packingBox([a, b, elbow, inner, outer], shell.stockEnvelopeM), count: 1});
      return {inner, outer, innerFace, outerFace, upper, lower, label};
    });
    for (const [i, panelId] of run.crownPanelIds.entries()) {
      const a = bays[i], b = bays[i + 1];
      rail(a.inner, b.inner, panelId + " · inner edge rail");
      rail(a.outer, b.outer, panelId + " · flank edge rail");
      rail(a.inner, b.outer, panelId + " · crown diagonal");
      traces.push({nodeId: a.upper.id, nodeIds: [a.upper.id, a.lower.id, b.upper.id, b.lower.id], panelId, description:
        a.label + " and " + b.label + " connect the paired upper/lower roots to both sheet ends. Detachable edge rails follow the crown. Short marks locate the four registered corners."});
    }
    const flank = sheets.get(run.flankPanelId);
    if (!flank || flank.points.length !== 3) throw Error("Expected a triangular flank pickup");
    const adjoining = bays.filter(b => flank.points.some(p => sameCorner(p, b.outerFace)));
    if (adjoining.length !== 2) throw Error("The flank reference must share a complete registered crown edge");
    const tipFace = flank.points.find(p => adjoining.every(b => !sameCorner(b.outerFace, p)));
    const tip = inboard(tipFace);
    for (const [i, b] of adjoining.entries()) rail(b.outer, tip, flank.panelId + " · return rail " + (i + 1));
    const root = adjoining.reduce((a, b) => distance(tip, a.lower.positionM) < distance(tip, b.lower.positionM) ? a : b);
    rail(root.lower.positionM, tip, flank.panelId + " · return brace");
    line(tip, tipFace, flank.panelId + " · lower tab datum", true);
    traces.push({nodeId: root.lower.id, nodeIds: adjoining.flatMap(b => [b.upper.id, b.lower.id]), panelId: run.flankPanelId, description:
      "Two return rails share the crown edge. The lower root braces the third corner of the triangular flank sheet. Tab positions, vibration and attachment strength await review."});
  }
  return {items, cargo, traces};
}
