/* Native glTF eye clips are shared by the website and downloadable model. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ripples = ['Backdraft', 'Double crest', 'Rolling bloom'];
  const looks = [
    ['ovine', 'Ovine Sauron', 'Ovine'],
    ['rainbow', 'Ovine rainbow', 'Rainbow'],
    ['vegeta', 'Vegeta', 'Anime'],
    ['sauron', 'Sauron', 'Sauron'],
    ['otaku', 'Otaku ^_^', 'Otaku'],
    ['hypnotoad', 'Hypnotoad', 'Hypnotoad'],
    ['show', 'Original five-look show', 'Archived five-look show']
  ];
  for (const viewer of document.querySelectorAll('model-viewer[data-animated-eyes]')) {
    const controls = document.querySelector(`[data-eye-controls="${viewer.id}"]`);
    const pause = controls?.querySelector('[data-eye-pause]');
    const status = controls?.querySelector('[data-eye-status]');
    const selector = controls?.querySelector('[data-eye-select]');
    const requested = new URLSearchParams(location.search).get('eyes');
    let selected = looks.find(look => look[0] === requested) || looks[0];
    let paused = reduced.matches, ready = false, onScreen = true, selectionVersion = 0;
    for (const [value, label] of looks) selector?.add(new Option(label, value));
    function playback() {
      if (!ready) return;
      if (paused || document.hidden || !onScreen) viewer.pause(); else viewer.play();
      if (pause) {
        pause.textContent = paused ? 'Play eyes' : 'Pause eyes';
        pause.setAttribute('aria-pressed', String(paused));
      }
    }
    async function choose(value = selected[0]) {
      if (!ready) return;
      const next = looks.find(look => look[0] === value);
      if (!next || !viewer.availableAnimations.includes('BAAABS | ' + next[2])) return;
      const version = ++selectionVersion;
      selected = next;
      // Fade-free switches prevent hidden expression meshes blending together.
      viewer.animationCrossfadeDuration = 0;
      viewer.animationName = 'BAAABS | ' + selected[2];
      if (selector) selector.value = selected[0];
      viewer.dataset.eyeMode = selected[0];
      const closeup = controls?.querySelector('[data-eye-link]');
      if (closeup) closeup.href = 'eyes.html?eyes=' + selected[0];
      // Lit applies the new animation on its next update; pause the new action,
      // not the outgoing one, when changing an expression while paused.
      await viewer.updateComplete;
      if (!ready || version !== selectionVersion) return;
      viewer.currentTime = 0;
      playback();
      updateStatus();
    }
    function updateStatus() {
      const t = viewer.currentTime || 0;
      let label = selected[1];
      if (selected[0] === 'ovine') label += ' · ' + ripples[Math.floor((t % 16) / (16 / 3))];
      if (selected[0] === 'show') {
        const second = t % 56;
        const mode = second < 16 ? 'ovine' : second < 24 ? 'rainbow' : second < 32 ? 'vegeta' : second < 48 ? 'sauron' : 'otaku';
        label = 'Show · ' + looks.find(look => look[0] === mode)[1];
      }
      if (status && status.textContent !== label) status.textContent = label;
    }
    function loaded() {
      ready = viewer.availableAnimations.includes('BAAABS | Ovine');
      if (!ready) { if (status) status.textContent = 'Eye model unavailable'; return; }
      if (controls) for (const el of controls.querySelectorAll('[data-eye-select], [data-eye-pause], [data-eye-focus], [data-eye-whole]')) el.disabled = false;
      if (selector) for (const option of selector.options) option.disabled = !viewer.availableAnimations.includes('BAAABS | ' + looks.find(look => look[0] === option.value)[2]);
      choose();
    }
    viewer.addEventListener('load', loaded);
    viewer.addEventListener('error', () => {
      ready = false;
      if (status) status.textContent = 'Eye model unavailable';
      if (selector) selector.disabled = true;
      if (pause) pause.disabled = true;
    });
    if (viewer.loaded) loaded();
    selector?.addEventListener('change', () => choose(selector.value));
    pause?.addEventListener('click', () => { paused = !paused; playback(); });
    controls?.querySelector('[data-eye-focus]')?.addEventListener('click', () => {
      window.revealWorkshopPanels?.();
      viewer.cameraTarget = '-7.14m 5.78m 0m'; viewer.cameraOrbit = '-90deg 83deg 3.6m';
    });
    controls?.querySelector('[data-eye-whole]')?.addEventListener('click', () => {
      viewer.cameraTarget = '0m 3.5m 0m'; viewer.cameraOrbit = '-125deg 76deg 22m';
    });
    reduced.addEventListener('change', () => { paused = reduced.matches; playback(); });
    document.addEventListener('visibilitychange', playback);
    new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; playback(); }).observe(viewer);
    const timer = setInterval(() => { if (ready && !document.hidden && onScreen) updateStatus(); }, 250);
    window.addEventListener('pagehide', () => clearInterval(timer), {once: true});
  }
})();
