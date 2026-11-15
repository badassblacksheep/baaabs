(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const form = get('study05-controls');
  function show(data) {
    function update() {
      const row = data.equipment.find(r => r.people === Number(get('people05').value) && r.extraLbf === Number(get('equipment05').value));
      if (!row) throw Error('Unsolved combination');
      get('stress05').textContent = row.stress.toFixed(1) + ' MPa';
      get('drop05').textContent = row.drop.toFixed(2) + ' in';
      get('seat05').textContent = Math.round(row.portalReaction).toLocaleString('en-US') + ' lbf';
      get('status05').textContent = (row.belowCeiling ? 'Below' : 'ABOVE') + ' the selected normal-stress ceiling at ' + row.people + ' people + ' + row.extraLbf + ' lb service storage. No occupied-deck or fabrication release.';
      get('case05').textContent = 'Governing member: ' + row.member + '; ' + row.stressCase + '. Stress, movement and support-force envelopes may come from different placements.';
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
    form.querySelector('fieldset').disabled = false;
  }
  fetch('iteration-05-data.json').then(r => { if (!r.ok) throw Error('Data unavailable'); return r.json(); }).then(show).catch(() => { get('error05').hidden = false; });
  get('model05').addEventListener('load', () => {
    for (const material of get('model05').model?.materials || []) {
      const group = material.name.match(/^Workshop_([^_]+)_/)?.[1];
      if (material.name.startsWith('Panel_') || ['deck','equipment','rails','sound','eye_effect'].includes(group)) {
        material.setAlphaMode('BLEND');
        material.pbrMetallicRoughness.setBaseColorFactor([...material.pbrMetallicRoughness.baseColorFactor.slice(0,3),0]);
      }
    }
  });
})();
