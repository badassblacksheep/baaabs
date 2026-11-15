/* Presentation of frozen iteration-05 results. No interpolation or new capacity claim. */
(() => {
  'use strict';
  const peopleOptions = [8, 12, 20];
  const fmt = (n, digits = 0) => n.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  function screen(row, ceiling = 207) {
    const ratio = row.stress / ceiling;
    return {ratio, color: ratio > 1 ? 'red' : ratio > .8 ? 'yellow' : 'green',
      label: ratio > 1 ? 'Above the chosen limit' : ratio > .8 ? 'Near the chosen limit' : 'More room below the limit'};
  }
  function selected(data, people, equipment) {
    const row = data.equipment.find(r => r.people === people && r.extraLbf === equipment);
    if (!row) throw Error('This combination was not calculated.');
    return row;
  }
  function comparisons(data, people) {
    const rows = ['grid04', 'light-truss'].map(concept => data.comparisons.find(r => r.concept === concept && r.people === people && r.share === 1));
    rows.push(selected(data, people, 0));
    if (rows.some(r => !r)) throw Error('Missing comparison case.');
    return rows;
  }
  function sensitivity(data, key) {
    if (key === 'base') return selected(data, 20, 250);
    const row = data.sensitivity.find(r => r.label === key);
    if (!row || !['3x-250', 'pinned-250'].includes(key)) throw Error('Missing sensitivity case.');
    return row;
  }
  globalThis.Baaabs05a = {screen, selected, comparisons, sensitivity, peopleOptions};
  if (typeof document === 'undefined') return;
  const get = id => document.getElementById(id);
  const text = (id, value) => { get(id).textContent = value; };

  function sideDiagram(shored) {
    const xs = Array.from({length: 9}, (_, i) => 60 + i * 80);
    let lines = '';
    for (let i = 0; i < 8; i++) {
      if (!shored && i === 4) continue;
      lines += `<path d="M${xs[i]} ${i % 2 ? 140 : 72}L${xs[i+1]} ${i % 2 ? 72 : 140}"/>`;
    }
    const posts = xs.slice(1, -1).map(x => `<path d="M${x} 72V140"/>`).join('');
    const supports = [220,380,540].map(x => `<path d="M${x} 140V173"/><path stroke-dasharray="5 5" d="M${x} 173V251"/>`).join('');
    const windows = [100,180,260,340,420,500,580].map(x => `<rect x="${x}" y="193" width="57" height="32" rx="3"/>`).join('');
    return `<title>${shored ? 'Earlier light truss with three visible shores, six total' : 'Accessible truss carried at its front and rear ends'}</title>
      <rect class="bus-body" x="60" y="173" width="640" height="81" rx="12"/><g class="bus-windows">${windows}</g>
      <path class="chassis" d="M72 255H687"/><circle class="wheel" cx="166" cy="260" r="23"/><circle class="wheel" cx="591" cy="260" r="23"/>
      <g class="truss-lines"><path d="M60 72H700V140H60Z"/>${lines}${posts}</g>
      <g class="end-supports"><path d="M60 72V250M700 72V250"/></g>
      ${shored ? `<g class="body-supports">${supports}</g>` : '<rect class="access-bay" x="385" y="81" width="70" height="51" rx="3"/><text class="svg-label" x="420" y="112" text-anchor="middle">access</text>'}
      <g class="load-arrows"><path d="M180 25V58m-7-9 7 9 7-9M380 25V58m-7-9 7 9 7-9M580 25V58m-7-9 7 9 7-9"/></g>
      <text class="svg-label" x="380" y="320" text-anchor="middle">${shored ? 'Orange: assumed load paths through Earl’s body' : 'Teal: load carried to the two end portals'}</text>`;
  }
  function show(data) {
    function update() {
      const n = peopleOptions[Number(get('crowd05a').value)];
      const row = selected(data, n, Number(get('gear05a').value));
      const state = screen(row, data.assumptions.stressCeilingMPa);
      text('crowd-value', n); get('crowd05a').setAttribute('aria-valuetext', n + ' people');
      text('crowd-caption', n + ' people illustrated; placement is not the governing load case.');
      get('crowd-icons').innerHTML = Array.from({length:n}, (_, i) => {
        const x = 18 + (i % 10) * 35, y = 20 + Math.floor(i / 10) * 40;
        return `<g transform="translate(${x} ${y})"><circle r="5"/><path d="M0 8v15m-8-11h16m-8 11-7 9m7-9 7 9"/></g>`;
      }).join('');
      get('selected-result').className = 'selected-result ' + state.color;
      text('stress-use', fmt(state.ratio * 100) + '%');
      text('stress-label', state.label);
      text('stress-demand', fmt(row.stress, 1));
      get('stress-fill').style.width = Math.min(100, state.ratio / 1.5 * 100) + '%';
      text('deck-drop', fmt(row.drop, 2)); text('seat-load', fmt(row.portalReaction));
      text('selection-summary', n + ' people + ' + fmt(row.extraLbf) + ' lb of service gear. Stress screen only; no operating headcount established.');
      text('governing05a', row.member + ' · ' + row.stressCase);
      text('load-working', fmt(row.frameWeight, 2) + ' + 2,311.25 + ' + fmt(row.extraLbf) + ' + 2 × ' + n + ' × 225 = ' + fmt(row.total, 2) + ' lbf');
      text('mass-working', fmt(row.dead + n * 225) + ' lb physically carried in this model; the force multiplier adds no physical mass.');
      text('comparison-crowd', n);
      comparisons(data, n).forEach((r,i) => {
        const s = screen(r);
        get('comparison-'+i).className = 'comparison-card ' + s.color;
        text('comparison-use-'+i, fmt(s.ratio * 100) + '%'); text('comparison-status-'+i, s.label);
        text('comparison-stress-'+i, fmt(r.stress,1)); text('comparison-drop-'+i,fmt(r.drop,2));
        text('comparison-shore-'+i, r.use_shores ? fmt(r.shore) + ' lbf into one shore' : 'No body reaction credited');
        get('comparison-bar-'+i).style.width = Math.min(100, s.ratio / 1.5 * 100) + '%';
      });
    }
    function updatePath() {
      const body = get('path05a').value === 'body';
      get('load-path').innerHTML = sideDiagram(body);
      text('path-caption', body ? 'Earlier 0.6004 m-deep light truss: six assumed body shores, no dedicated storage opening. This is a different frame from the accessible truss.' : 'Current 0.8 m-deep accessible truss: no cabin uprights and no body shores. Both end portals require verified chassis connections.');
      text('path-finding', body ? 'At 20 people, full skins and no extra gear: ' + fmt(data.comparisons.find(r=>r.concept==='light-truss'&&r.people===20&&r.share===1).shore) + ' lbf peak into one shore. Reducing the assumed body-path stiffness from 5,000 to 1,000 lbf/in increases peak stress from 189.6 to 238.0 MPa, above the screen.' : 'Adding shores to this exact access-preserving truss has not been calculated. Any future shores must meet structural nodes, preserve the access openings, and land on verified body structure.');
    }
    function updateSensitivity() {
      const key=get('sensitivity05a').value, r=sensitivity(data,key), s=screen(r);
      get('sensitivity-result').className='sensitivity-result '+s.color;
      text('sensitivity-stress',fmt(r.stress,1)+' MPa');text('sensitivity-drop',fmt(r.drop,2)+' in');
      text('sensitivity-force',fmt(r.alpha*20*225)+' lbf');
      text('sensitivity-seat',fmt(r.portalReaction)+' / '+fmt(r.uplift)+' lbf');
      get('sensitivity-fill').style.width=Math.min(100,s.ratio/1.5*100)+'%';
      text('sensitivity-status',s.label+' · '+fmt(s.ratio*100)+'% of the 207 MPa screen');
      text('sensitivity-explanation',key==='3x-250' ? 'The larger assumed force exceeds our stress limit. This predicts a failed screening check, not a collapse event. We have not mapped 2× or 3× to a particular style of dancing.' : key==='pinned-250' ? 'Allowing the feet to rotate changes member stress very little, but raises connection forces and creates uplift. Similar stress does not mean the attachments are adequate.' : 'This is the default calculated case. Doubling dancer weight is a chosen load sensitivity, not a validated bound on dancing forces.');
    }
    get('concept-controls').addEventListener('input',update);
    get('concept-controls').addEventListener('change',update);
    get('path05a').addEventListener('change',updatePath);
    get('sensitivity05a').addEventListener('change',updateSensitivity);
    update(); updatePath(); updateSensitivity();
    for(const el of document.querySelectorAll('[data-needs-data]')) el.disabled=false;
  }
  fetch('iteration-05-data.json').then(r=>{if(!r.ok)throw Error('Data unavailable');return r.json();}).then(show).catch(error=>{
    get('data-error05a').hidden=false;
    get('data-error05a').textContent='Interactive data could not load. Controls remain unavailable; the calculation tables below and original 05 report remain available.';
    console.error(error);
  });
  const model=get('model05a'), originalColors=new WeakMap();
  function modelView() {
    const showSkin=get('skin05a').checked;
    for(const material of model.model?.materials||[]) {
      if(!originalColors.has(material)) originalColors.set(material,[...material.pbrMetallicRoughness.baseColorFactor]);
      const color=originalColors.get(material),group=material.name.match(/^Workshop_([^_]+)_/)?.[1];
      if(material.name.startsWith('Panel_')||['deck','equipment','rails','sound','eye_effect'].includes(group)) {
        material.setAlphaMode('BLEND');material.pbrMetallicRoughness.setBaseColorFactor([...color.slice(0,3),showSkin?color[3]:0]);
      }
    }
  }
  model.addEventListener('load',modelView);get('skin05a').addEventListener('change',modelView);
})();
