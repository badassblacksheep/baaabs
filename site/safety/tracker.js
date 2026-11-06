const filter = document.getElementById('tracker-filter');
const count = document.getElementById('tracker-count');
const checks = document.getElementById('checks');

async function loadTracker() {
  const response = await fetch('https://docs.google.com/spreadsheets/d/1dALuLzn5qxW854JYKsr0dxmvOLOztxLGbxmjZGHAjvI/gviz/tq?sheet=Acceptance&headers=1&tqx=out:json', {cache: 'no-store', credentials: 'omit'});
  if (!response.ok) throw new Error('Sheet unavailable');
  const raw = await response.text();
  const wrapper = raw.match(/^\s*(?:\/\*[^]*?\*\/\s*)?google\.visualization\.Query\.setResponse\(([^]*)\);?\s*$/);
  if (!wrapper) throw new Error('Unreadable sheet');
  const {table} = JSON.parse(wrapper[1]);
  const labels = table.cols.map(col => col.label);
  for (const field of ['ID', 'Guideline', 'Status']) {
    if (!labels.includes(field)) throw new Error('Required column missing');
  }
  const rows = table.rows.map(row => Object.fromEntries(labels.map((label, i) => [label, String(row.c[i]?.f ?? row.c[i]?.v ?? '')]))).filter(row => row.ID);
  function render() {
    const term = filter.value.trim().toLowerCase();
    const matches = rows.filter(row => Object.values(row).some(value => value.toLowerCase().includes(term)));
    checks.replaceChildren();
    for (const row of matches) {
      const detail = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = [row.ID, row.Guideline, row.Status].join(' · ');
      const fields = document.createElement('dl');
      for (const [label, value] of Object.entries(row)) {
        if (!value || ['ID', 'Guideline', 'Status'].includes(label)) continue;
        const key = document.createElement('dt');
        const data = document.createElement('dd');
        key.textContent = label;
        data.textContent = value;
        fields.append(key, data);
      }
      detail.append(summary, fields);
      checks.append(detail);
    }
    count.textContent = matches.length + ' of ' + rows.length + ' checks';
  }
  filter.disabled = false;
  filter.addEventListener('input', render);
  render();
}
loadTracker().catch(() => { count.textContent = 'The tracker could not load here. Open it in Google Sheets above.'; });
