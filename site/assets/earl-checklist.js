(() => {
  'use strict';
  const form = document.querySelector('#checklist');
  if (!form) return;
  const items = [...form.querySelectorAll('input[type="checkbox"]')];
  const progress = document.querySelector('#progress');
  const count = document.querySelector('#count');
  function update() {
    const done = items.filter(item => item.checked).length;
    progress.max = items.length;
    progress.value = done;
    count.textContent = done + ' / ' + items.length + ' checked';
  }
  function clear() { items.forEach(item => { item.checked = false; }); update(); }
  form.addEventListener('change', update);
  document.querySelector('#reset').addEventListener('click', () => {
    if (!items.some(item => item.checked) || window.confirm('Clear all checks and start a new session?')) clear();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
  clear();
})();
