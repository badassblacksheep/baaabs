import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';

const resource = name => readFileSync(new URL('../site/assets/' + name, import.meta.url));

test('homepage geometry carries both eye channels, selectable skin and registered Earl photograph UVs', () => {
  const modes = new Set(), photoUVs = new Set();
  for (const group of ['shell', 'details']) {
    const bytes = gunzipSync(resource('home-model/' + group + '.mesh'));
    let offset = 0;
    while (offset < bytes.length) {
      const vertices = bytes.readUInt32LE(offset), indices = bytes.readUInt32LE(offset + 4);
      offset += 8;
      for (let j = 0; j < vertices; j++) {
        const vertex = offset + j * 14, mode = bytes[vertex + 9];
        modes.add(mode);
        if (mode === 4) photoUVs.add(bytes.readUInt32LE(vertex + 10));
      }
      offset += 14 * vertices + 2 * indices;
    }
    assert.equal(offset, bytes.length);
  }
  assert.deepEqual([...modes].sort(), [0,1,2,4,5]);
  assert.ok(photoUVs.size > 100);
  const model = resource('models/earl-animated-eyes.glb'), jsonSize = model.readUInt32LE(12);
  const doc = JSON.parse(model.subarray(20, 20 + jsonSize));
  const photo = doc.images.find(image => image.name === 'Earl-atlas');
  const view = doc.bufferViews[photo.bufferView], start = 28 + jsonSize + view.byteOffset;
  assert.deepEqual(resource('home-model/earl-photo.jpg'), model.subarray(start, start + view.byteLength));
});

test('homepage and driving meshes include the revised sheet boundaries', () => {
  const surface = new Set(), driving = new Set();
  for (const group of ['shell','details']) {
    const mesh = gunzipSync(resource('home-model/' + group + '.mesh'));
    for (let offset = 0; offset < mesh.length;) {
      const count = mesh.readUInt32LE(offset), indices = mesh.readUInt32LE(offset + 4);
      offset += 8;
      for (let j = 0; j < count; j++) {
        const row = offset + 14*j;
        if (mesh[row+9] === 5) surface.add([0,2,4].map(k => mesh.readInt16LE(row+k)).join(','));
      }
      offset += count*14 + indices*2;
    }
  }
  const vehicle = gunzipSync(readFileSync(new URL('../site/test-drive/drive-model.mesh',import.meta.url)));
  for (let pos = 24; pos < vehicle.length; pos += 24) {
    driving.add([0,4,8].map(k => Math.round(1000*vehicle.readFloatLE(pos+k))).join(','));
  }
  const plan = JSON.parse(resource('earl-panel-layout.json'));
  assert.equal(plan.pieces.length,206);
  let verified = 0;
  function near(set,x,y,z) {
    // Web and game use independent quantization steps of 1 mm and 0.1 mm.
    for (const dx of [0,1,-1]) for (const dy of [0,1,-1]) for (const dz of [0,1,-1]) {
      if (set.has([x+dx,y+dy,z+dz].join(','))) return true;
    }
    return false;
  }
  for (const sheet of plan.pieces) for (const face of sheet.faces) for (const [x,y,z] of face.vertices_m ?? []) {
    const pt = [x,z,-y].map(v => Math.round(1000*v));
    assert.ok(near(surface,...pt), sheet.id+' absent from homepage at '+pt);
    assert.ok(near(driving,...pt), sheet.id+' absent from game at '+pt);
    verified++;
  }
  assert.ok(verified > 100);
});
