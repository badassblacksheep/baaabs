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
  function showEarl() {
    for (const material of model.model.materials) {
      if (!material.name.startsWith('Panel_') || material.isLoaded === false) continue;
      const pbr = material.pbrMetallicRoughness;
      pbr.setBaseColorFactor([0.006, 0.006, 0.006, pbr.baseColorFactor[3]]);
      pbr.setMetallicFactor(0);
      pbr.setRoughnessFactor(1);
    }
    toggle.hidden = false;
  }
  model.addEventListener('load', showEarl);
  if (model.loaded) showEarl();
  model.addEventListener('error', () => {
    hint.textContent = '3D view unavailable';
    toggle.hidden = true;
  });
  toggle.addEventListener('click', () => setRotation(!model.hasAttribute('auto-rotate')));
  motion.addEventListener('change', () => setRotation(!motion.matches));
})();
