(() => {
  const model = document.querySelector('#earl');
  const toggle = document.querySelector('#rotation-toggle');
  const hint = document.querySelector('#model-hint');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function setRotation(enabled) {
    model.toggleAttribute('auto-rotate', enabled);
    toggle.textContent = enabled ? 'Pause rotation' : 'Resume rotation';
  }

  setRotation(!motion.matches);
  model.addEventListener('load', () => { toggle.hidden = false; });
  model.addEventListener('error', () => {
    hint.textContent = '3D view unavailable';
    toggle.hidden = true;
  });
  toggle.addEventListener('click', () => setRotation(!model.hasAttribute('auto-rotate')));
  motion.addEventListener('change', () => setRotation(!motion.matches));
})();
