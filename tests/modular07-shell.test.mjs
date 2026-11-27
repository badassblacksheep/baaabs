import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {buildBackbone, compareDecks} from "../site/structural/modular-07/backbone.mjs";
import {buildShell} from "../site/structural/modular-07/shell.mjs";

const base = new URL("../site/structural/modular-07/", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, base), "utf8"));
const design = read("design.json");
const ctx = {design, frame: read(design.inputs.recipe).candidate, material: read(design.inputs.material),
  panels: read(design.inputs.panels), shellConfig: read(design.inputs.shellConfig)};
function shellFor(id) {
  const selected = compareDecks(ctx).find(format => format.id === id);
  const {nodes} = buildBackbone({...ctx, analysis: {selected}});
  return {nodes, ...buildShell(ctx, nodes)};
}

test("Rev 07 carries through the surveyed register, holes and DJ trim", () => {
  const {items} = shellFor(design.deck.selected);
  const toLocal = ([x, y, z]) => [x - ctx.shellConfig.frontBumperWorldXM, y, z];
  const plates = items.filter(item => item.layer === "skin" && item.panelId !== ctx.shellConfig.frameId);
  assert.equal(plates.length, ctx.panels.panel_count);
  const byId = new Map(plates.map(p => [p.panelId, p]));
  for (const piece of ctx.panels.pieces) {
    assert.deepEqual(byId.get(piece.id).points, piece.vertices_m.map(toLocal));
    assert.deepEqual(byId.get(piece.id).holes, piece.holes_m.map(loop => loop.map(toLocal)));
  }
  const rim = items.filter(item => item.panelId === ctx.shellConfig.frameId);
  assert.deepEqual(rim.map(p => p.points), ctx.shellConfig.rimFacesWorldM.map(face => face.map(toLocal)));
  assert.ok(rim.length && rim.every(item => item.layer === "skin"));
});

test("Crown and flank carriers trace actual registered corners independently of cassette size", () => {
  const {nodes, items, cargo, traces} = shellFor(design.deck.selected);
  assert.deepEqual(traces.map(t => t.panelId).sort(),
    design.shell.runs.flatMap(run => [...run.crownPanelIds, run.flankPanelId]).sort());
  const regs = new Map(items.filter(i => i.panelId).map(i => [i.panelId, i.points]));
  const adapter = items.filter(item => item.layer === "panels");
  const tabs = new Set(adapter.filter(i => i.guide).map(i => JSON.stringify(i.points[1])));
  for (const trace of traces) {
    assert.ok(trace.nodeIds.includes(trace.nodeId));
    for (const id of trace.nodeIds) assert.ok(nodes.find(n => n.id === id && n.classId === "panel"));
    for (const corner of regs.get(trace.panelId)) assert.ok(tabs.has(JSON.stringify(corner)), trace.panelId);
  }
  const {apertureWorldXZM} = ctx.shellConfig;
  const windowTop = Math.max(...apertureWorldXZM.map(p => p[1]));
  assert.ok(adapter.every(i => i.points.every(p => p[2] > windowTop)));
  assert.ok(cargo.every(i => i.layer === "panels" && i.sizeM.every(n => n > 0)));
  for (const {id} of design.deck.formats) assert.deepEqual(shellFor(id).items, items);
});
