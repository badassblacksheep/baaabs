// Use the vertical field of view at the orbit target, so optical zoom and dolly
// agree and the same framing works on a phone, a Retina screen and a desktop.
(() => {
  const states = new WeakMap();
  function update(viewer, force = false) {
    const state = states.get(viewer);
    if (!state) return;
    const { fullPerforations, opaquePanels, alphaCutoff } = state.settings;
    const height = 2 * viewer.getCameraOrbit().radius * Math.tan(viewer.getFieldOfView() * Math.PI / 360);
    const t = Math.max(0, Math.min(1, (height - fullPerforations) / (opaquePanels - fullPerforations)));
    const cutoff = alphaCutoff * Math.round(255 * (1 - t*t*(3 - 2*t))) / 255;
    if (!force && cutoff === state.last) return;
    state.last = cutoff;
    for (const sheet of state.sheets) {
      if (sheet.isLoaded !== false && sheet.getAlphaMode() === 'MASK' && sheet.getAlphaCutoff() !== cutoff)
        sheet.setAlphaCutoff(cutoff);
    }
  }
  window.updatePanelVisibility = update;
  function attach(viewer) {
    function loaded() {
      const settings = viewer.originalGltfJson?.asset?.extras?.panelVisibility;
      if (!settings || !viewer.model) return;
      states.set(viewer, { settings, sheets: viewer.model.materials.filter(m => m.name.startsWith('Panel_')) });
      update(viewer);
    }
    viewer.addEventListener('load', loaded);
    viewer.addEventListener('camera-change', () => update(viewer));
    if (viewer.model) loaded();
  }
  window.attachPanelVisibility = attach;
  for (const viewer of document.querySelectorAll('model-viewer[data-animated-eyes]')) attach(viewer);
})();
