(() => {
  const video = document.querySelector('#disco-film');
  const toggle = document.querySelector('#film-toggle');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let loaded = false;
  function loadVideo() {
    if (loaded) return;
    for (const source of video.querySelectorAll('source[data-src]')) source.src = source.dataset.src;
    video.load(); loaded = true;
  }
  const label = () => { toggle.textContent = video.paused ? 'Play animation' : 'Pause animation'; };
  toggle.hidden = false;
  toggle.addEventListener('click', async () => {
    if (!video.paused) { video.pause(); return; }
    loadVideo();
    try { await video.play(); } catch { toggle.textContent = 'Animation unavailable'; }
  });
  video.addEventListener('play', label); video.addEventListener('pause', label);
  video.addEventListener('error', () => { toggle.textContent = 'Animation unavailable'; });
  if (!motion.matches && !navigator.connection?.saveData) { loadVideo(); video.play().catch(label); }
  motion.addEventListener('change', () => { if (motion.matches) video.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  const details = document.querySelector('#model');
  let initialized = false;
  details.addEventListener('toggle', () => {
    if (!details.open || initialized) return;
    initialized = true;
    const script = document.createElement('script'); script.type = 'module';
    script.src = 'assets/vendor/model-viewer-4.1.0.min.js';
    script.onerror = () => { document.querySelector('#model-slot').textContent = 'Interactive model unavailable. Use The build link below.'; };
    document.head.append(script);
    const model = document.createElement('model-viewer');
    model.src = 'assets/models/baaabs-earl-geodesic.glb'; model.alt = 'Interactive BAAABS on Earl with faceted cloven hooves';
    model.setAttribute('camera-controls', '');model.setAttribute('touch-action','pan-y');
    model.setAttribute('shadow-intensity','.7');model.setAttribute('exposure','1.2');
    document.querySelector('#model-slot').replaceChildren(model);
  });
})();
