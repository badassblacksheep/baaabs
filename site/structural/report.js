(function () {
  'use strict';
  const form = document.getElementById('scenario');
  const controls = form.elements;
  const get = id => document.getElementById(id);
  const walls = ['⅛ in', '3/16 in', '¼ in'];
  const number = (value, digits = 0) => value.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgLine = (x1, y1, x2, y2, stroke, width = 1) => {
    const line = document.createElementNS(svgNS, 'line');
    for (const [key, val] of Object.entries({x1, y1, x2, y2, stroke, 'stroke-width': width}))
      line.setAttribute(key, val);
    return line;
  };
  const x = ft => 33 + 10 * ft;
  const y = lateralFt => 75 - 10 * lateralFt;
  const posts = get('post-marks');
  function drawFrame(geometry, rear) {
    const group = get('roof-lines');
    group.replaceChildren();
    posts.replaceChildren();
    const coords = pt => [x((pt[0] - geometry.front) / .3048), y(pt[1] / .3048)];
    for (const [a, b, type] of geometry.lines) {
      const heavy = type === 'bearer' || type === 'girder';
      group.append(svgLine(...coords(a), ...coords(b), heavy ? '#c7dfd8' : '#767983', heavy ? 2 : 1));
    }
    for (const [pt, isRear] of geometry.posts) {
      if (isRear && !rear) continue;
      const [cx, cy] = coords(pt);
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx',cx); dot.setAttribute('cy',cy); dot.setAttribute('r',3.6);
      dot.setAttribute('fill','#bdffd9'); posts.append(dot);
    }
  }
  function footprint(id) {
    const match = /^patch_([\d.]+)ft_at_([\d.]+)ft$/.exec(id);
    if (match) return {start:+match[2], length:+match[1], half:true};
    if (id === 'party_midspan') return {start:12, length:12, half:true};
    if (id === 'party_rear') return {start:24, length:12, half:true};
    return {start:0, length:36, half:id === 'party_half'};
  }
  function describeCase(id) {
    const p = footprint(id);
    const side = p.half ? ' on the driver side' : ' across the deck';
    return p.length === 36 ? ('full length' + side) :
      (p.length + ' × 4 ft, starting ' + p.start + ' ft from the front deck edge');
  }
  function show(data) {
    function update() {
      const people = +controls.people.value, w = +controls.wall.value;
      const rear = controls.portal.value === 'workshop_rear';
      const model = data.walls[w][controls.portal.value];
      const result = model.people[people][controls.placement.value];
      const swept = controls.placement.value === 'sweep';
      const exceed = result.stress >= data.yieldMPa;
      get('people-value').textContent = people;
      get('wall-value').textContent = walls[w];
      controls.people.setAttribute('aria-valuetext',people + ' people');
      controls.wall.setAttribute('aria-valuetext',walls[w] + ' tube wall');
      get('stress').textContent = number(result.stress);
      get('drop').textContent = number(result.drop,2);
      get('compression').textContent = number(result.post);
      get('uplift').textContent = number(result.uplift);
      get('mass').textContent = number(model.dead) + ' lb frame and plywood + ' +
        number(225 * people) + ' lb people = ' + number(model.dead + 225 * people) + ' lb';
      get('member').textContent = result.member;
      get('yield-comparison').textContent = Math.round(100*result.stress/data.yieldMPa) + '% of assumed first yield.';
      get('interpretation').textContent = exceed ?
        'At or above assumed yield in this static model. Elastic displacement loses accuracy after yielding.' :
        'Below assumed yield in this static model. Dancing capacity and chassis attachments still require verification.';
      get('status-line').classList.toggle('over',exceed);
      drawFrame(data.geometry, rear);
      const p = footprint(result.stressCase);
      const patch = get('crowd-rect');
      for (const [key,val] of Object.entries({x:x(p.start),width:10*p.length,y:p.half?75:35,height:p.half?40:80}))
        patch.setAttribute(key,val);
      patch.style.display = people ? '' : 'none';
      get('plan-caption').textContent = people ? 'Crowd footprint at peak stress: ' + describeCase(result.stressCase) + '.' :
        'Dead load only. No people on the deck.';
      get('plan-title').textContent = get('plan-caption').textContent + ' Dots mark modeled posts.';
      get('case-note').textContent = swept && people ?
        'Each readout is its maximum across the sampled placements. Peak drop: ' + describeCase(result.dropCase) + '.' :
        (people ? 'All four readouts use the selected load placement.' : 'The frame and plywood supply the entire load.');
      get('mount-note').textContent = result.uplift ? 'Peak uplift at the ' + result.support + '.' :
        'All modeled seats remain in compression under the selected static loads.';
    }
    form.addEventListener('input',update);
    form.addEventListener('change',update);
    form.querySelector('fieldset').disabled = false;
    update();
  }
  fetch('load-cases.json').then(r => {
    if (!r.ok) throw Error('Load data unavailable');
    return r.json();
  }).then(show).catch(() => {
    get('interpretation').textContent = 'The interactive results could not load. The comparison table and engineering findings are available below.';
  });
})();
