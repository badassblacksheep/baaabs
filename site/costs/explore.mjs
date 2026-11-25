import {amount, chartValue, dollars, share} from './format.mjs';

const chart = document.querySelector('#explorer');
const controls = chart.querySelector('.chart-tools');
const readout = chart.querySelector('.chart-readout');
const bus = controls.querySelector('[data-bus]');
const ticks = [...chart.querySelectorAll('.ticks span')];
const groups = [...chart.querySelectorAll('[data-category]')].map(row => ({
  row,
  key: row.dataset.category,
  cents: Number(row.dataset.cents),
  estimated: Number(row.dataset.estimated),
  name: row.querySelector('.row-copy strong').textContent,
  details: row.querySelector('details'),
  segment: chart.querySelector('[data-segment="' + row.dataset.category + '"]')
}));

let mode, visible, total, estimated;
function describe(group) {
  if (group) {
    return group.name + ' · ' + amount(group.cents, group.estimated) + ' · ' +
      chartValue(group.cents, group.estimated, total, 'hundred') + ' of every $100 shown';
  }
  const scope = bus && !bus.checked ? 'Beyond the bus purchase' : 'All project spending';
  return scope + ' · ' + amount(total, estimated) + ' across ' + visible.length +
    (visible.length === 1 ? ' category' : ' categories');
}
function highlight(group) {
  for (const item of visible) {
    item.segment.classList.toggle('active', group === item);
    item.row.classList.toggle('active', group === item);
  }
  readout.textContent = describe(group);
}
function restoreSelection() {
  highlight(visible.find(g => g.details.open));
}
function draw() {
  mode = controls.querySelector('input[name="chart-units"]:checked').value;
  visible = groups.filter(g => g.key !== 'vehicle' || !bus || bus.checked);
  total = visible.reduce((sum,g)=>sum + g.cents, 0);
  estimated = visible.reduce((sum,g)=>sum + g.estimated, 0);
  for (const g of groups) {
    const shown = visible.includes(g);
    g.row.hidden = g.segment.hidden = !shown;
    if (!shown) {
      g.details.open = false;
      continue;
    }
    g.row.querySelector('.row-value').textContent = chartValue(g.cents, g.estimated, total, mode);
    g.row.querySelector('.row-percent').textContent = share(g.cents,total);
    g.segment.setAttribute('aria-label', 'Show purchases for ' + describe(g));
  }
  ticks.forEach((tick,i) => {
    const fraction = i / (ticks.length - 1);
    tick.textContent = dollars.format(fraction * (mode === 'hundred' ? 100 : total / 100));
  });
  restoreSelection();
}

for (const g of groups) {
  g.segment.addEventListener('pointerenter', () => highlight(g));
  g.segment.addEventListener('pointerleave', restoreSelection);
  g.segment.addEventListener('focus', () => highlight(g));
  g.segment.addEventListener('blur', restoreSelection);
  g.segment.setAttribute('aria-controls',g.details.id);
  g.segment.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    g.details.open = true;
    g.details.querySelector('summary').focus({preventScroll:true});
    g.details.scrollIntoView({block:'nearest'});
    highlight(g);
  });
  g.details.addEventListener('toggle', () => {
    g.segment.setAttribute('aria-expanded', String(g.details.open));
    restoreSelection();
  });
  g.segment.setAttribute('aria-expanded', String(g.details.open));
}
controls.addEventListener('change', draw);
draw();
controls.hidden = readout.hidden = false;
