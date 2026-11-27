// Cabin-local axes: x increases aft, y increases toward the passenger side, z is height above floor.
// This is a dimensional experiment. The scene contains envelopes, not a restraint or rack design.
import {IN as INCH} from './backbone.mjs';
const TOL = 1e-8;

function cabinOutline(length, halfWidth, wallHeight, aisleHalfWidth) {
  const items = [];
  const line = (a, b, label) => items.push({layer: 'context', kind: 'line', points: [a, b], label});
  for (const x of [0, length]) {
    for (const y of [-halfWidth, halfWidth]) {
      line([x,y,0], [x,y,wallHeight], 'Wall-height study envelope');
    }
    for (const z of [0, wallHeight]) {
      line([x,-halfWidth,z], [x,halfWidth,z], 'Measured-width study envelope');
    }
  }
  for (const y of [-halfWidth, halfWidth]) {
    for (const z of [0, wallHeight]) line([0,y,z], [length,y,z], 'Aisle-length study envelope');
  }
  for (const y of [-aisleHalfWidth, aisleHalfWidth]) {
    line([0,y,0], [length,y,0], 'Reserved access strip');
  }
  return items;
}

function orientations(entry) {
  const [a, b, c] = entry.sizeM;
  const [long, mid, short] = [...entry.sizeM].sort((x, y) => y-x);
  if (entry.layer === 'audio') return [[Math.max(a,b), Math.min(a,b), c]];
  if (entry.layer === 'deck' && entry.id.startsWith('Cassette ')) return [[Math.max(a,b), c, Math.min(a,b)]];
  // Prefer members on their wide face. A second orientation stands a flat frame edgewise.
  return [[long, mid, short], [long, short, mid]];
}

function clearOfStack(x, y, length, width, stack, separator) {
  return x + length + separator <= stack.x + TOL || stack.x + stack.length + separator <= x + TOL ||
         y + width + separator <= stack.y + TOL || stack.y + stack.width + separator <= y + TOL;
}

function findFloorSlot(entry, lanes, bounds) {
  let best;
  for (const [length,width,height] of orientations(entry)) {
    if (height + bounds.base > bounds.height + TOL) continue;
    for (const lane of lanes) {
      const xs = [bounds.endGap, ...lane.stacks.map(s => s.x + s.length + bounds.gap)];
      const ys = [lane.lo, ...lane.stacks.map(s => s.y + s.width + bounds.gap)];
      for (const x of xs) {
        if (x + length > bounds.length - bounds.endGap + TOL) continue;
        for (const y of ys) {
          if (y + width > lane.hi + TOL) continue;
          if (!lane.stacks.every(s => clearOfStack(x, y, length, width, s, bounds.gap))) continue;
          if (!best || x + length < best.x + best.length - TOL ||
              (Math.abs(x + length - best.x - best.length) < TOL && width < best.width)) {
            best = {x, y, length, width, height, top: bounds.base, layer: entry.layer, lane};
          }
        }
      }
    }
  }
  return best;
}

function bundleSlot(entry, lanes, bounds) {
  // A low open rack can separate loose pieces of different lengths into independent tiers.
  // Keep each upper envelope in the footprint of its rack; do not nest frames or use cargo as a shelf.
  if (entry.layer === 'audio' || entry.id.startsWith('Cassette ')) return null;
  let best = null;
  for (const [length,width,height] of orientations(entry)) {
    for (const lane of lanes) for (const s of lane.stacks) {
      if (s.layer === 'audio' || s.cassette || length > s.length+TOL || width > s.width+TOL ||
          s.top + bounds.gap + height > bounds.base + bounds.bundleHeight + TOL) continue;
      if (!best || s.length*s.width < best.stack.length*best.stack.width) {
        best = {stack: s, length, width, height};
      }
    }
  }
  return best;
}

function buildGroups(cargo) {
  const ids = new Set();
  for (const {id, count, sizeM} of cargo) {
    if (!id || ids.has(id) || !Number.isInteger(count) || count <= 0 ||
        sizeM?.length !== 3 || !sizeM.every(v => Number.isFinite(v) && v > 0)) {
      throw new Error('Invalid or duplicate Rev 07 cargo group: '+id);
    }
    ids.add(id);
  }
  function priority(e) {
    if (e.id.startsWith('Cassette ')) return 0;
    if (e.layer === 'primary' && e.id.includes(' truss ')) return 1;
    if (e.layer === 'audio' || e.layer === 'shores') return 2;
    return 3;
  }
  return cargo.map(entry => ({...entry, inside: 0, staged: 0})).sort((a,b) =>
    priority(a)-priority(b) ||
    Math.max(...b.sizeM) - Math.max(...a.sizeM) || b.count - a.count || a.id.localeCompare(b.id));
}

export function buildPacking({donor, design, cargo, panels}) {
  const t = design.transport;
  const length = donor.aisleIn * INCH, width = donor.floorWidthIn * INCH;
  const access = t.aisleStudyIn * INCH, wallGap = t.wallGapIn * INCH;
  const bounds = {length, height: donor.wallIn * INCH, endGap: t.endGapIn * INCH,
    gap: t.separatorIn * INCH, base: t.rackBaseIn * INCH, bundleHeight: t.bundleHeightIn * INCH};
  if (![length,width,access,wallGap,...Object.values(bounds)].every(v => Number.isFinite(v) && v >= 0) ||
      access + 2 * wallGap >= width || bounds.base + bounds.bundleHeight > bounds.height) {
    throw new Error('Invalid Rev 07 cabin or packing-study dimensions.');
  }
  const lanes = [
    {lo: -width/2 + wallGap, hi: -access/2, stacks: []},
    {lo: access/2, hi: width/2 - wallGap, stacks: []},
  ];
  const items = cabinOutline(length, width/2, bounds.height, access/2);
  const inventory = buildGroups(cargo);
  let stagedX = 0, stagedY = width/2 + access, rowWidth = 0;
  for (const group of inventory) {
    for (let n = 0; n < group.count; n++) {
      const tier = bundleSlot(group, lanes, bounds);
      const s = tier?.stack ?? findFloorSlot(group, lanes, bounds);
      const z = tier ? s.top + bounds.gap : bounds.base;
      if (!tier && s) {
        s.cassette = group.id.startsWith('Cassette ');
        s.lane.stacks.push(s);
      }
      const label = group.id + ' ' + (n+1) + '/' + group.count;
      if (s) {
        const {length, width, height} = tier ?? s;
        s.top = z + height;
        group.inside++;
        items.push({layer: group.layer, kind: 'box', label, cargoId: group.id, location: 'inside',
          points: [[s.x, s.y, z],[s.x+length, s.y+width, s.top]]});
      } else {
        const [l,w,h] = orientations(group).at(-1);
        if (stagedX && stagedX+l > length) {
          stagedX = 0;
          stagedY += rowWidth+bounds.gap;
          rowWidth = 0;
        }
        group.staged++;
        items.push({layer: group.layer, kind: 'box', label: label + ' · offboard', cargoId: group.id,
          location: 'staged', points: [[stagedX, stagedY, 0],[stagedX+l, stagedY+w, h]]});
        stagedX += l+bounds.gap;
        rowWidth = Math.max(rowWidth,w);
      }
    }
  }
  const deferredSpecial = panels.special_items.filter(item => !cargo.some(group => group.id === item.id));
  let longestSheet = null;
  for (const piece of panels.pieces) {
    for (const [i,a] of piece.vertices_m.entries()) {
      for (const b of piece.vertices_m.slice(i+1)) {
        const spanIn = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) / INCH;
        if (!longestSheet || spanIn > longestSheet.spanIn) longestSheet = {id: piece.id, spanIn};
      }
    }
  }
  const metrics = {
    inventory, modeled: inventory.reduce((n,g) => n+g.count,0),
    inside: inventory.reduce((n,g) => n+g.inside,0),
    staged: inventory.reduce((n,g) => n+g.staged,0),
    cabinIn: [donor.aisleIn, donor.floorWidthIn, donor.wallIn], reservedAisleIn: t.aisleStudyIn,
    deferredSheets: panels.pieces.length, longestSheet, deferredSpecialIds: deferredSpecial.map(s => s.id),
  };
  const notes = [
    `${metrics.inside} of ${metrics.modeled} modeled cargo envelopes fall inside the two study lanes. ${metrics.staged} remain in the exterior staging area. This trial places cassettes, side trusses and owned equipment early, then fills the remaining rack space with loose members. Each box includes air inside its assembly.`,
    `The floor prism combines a ${donor.aisleIn} in aisle reading, ${donor.floorWidthIn} in wall-to-wall width and ${donor.wallIn} in wall height. The aisle endpoints and actual clear volume need measurement. The ${donor.crownIn} in crown adds no packing credit.`,
    `Trial allowances reserve a ${t.aisleStudyIn} in center strip, ${t.wallGapIn} in at each wall, ${t.endGapIn} in at each end, ${t.rackBaseIn} in under cargo and ${t.separatorIn} in between parts. Cassettes travel on edge. Loose steel pieces may share separate levels of a theoretical ${t.bundleHeightIn} in rack tier envelope. Validate every rack, restraint, lifting point and aisle against the actual cargo.`,
    `Hold ${metrics.deferredSheets} registered sheets for separate padded-rack trials${deferredSpecial.length ? '; also reserve separate space for '+deferredSpecial.map(s=>s.name).join(', ') : ''}. ${longestSheet ? 'Trial a full-size packing outline of '+longestSheet.id+' ('+longestSheet.spanIn.toFixed(1)+' in tip to tip) on the loading route. ' : ''}Measure the assembled head, guardrails, stair sections, hardware bins, panel edges and protection before allocating vehicle space. The future lower cradle, including its bearer and adapter hardware, still needs a transport breakdown. Array and subwoofer envelopes depend on the selected equipment.`,
    'An envelope inside these lanes still needs a successful door-to-rack sweep. Mark the entrance, engine box, wheel wells, seat mounts, exits, driver space and clear escape route on Earl. Obtain axle weights and engineer restraint anchorages for the packed vehicle.',
  ];
  return {items, notes, metrics};
}
