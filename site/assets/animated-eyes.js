/* Native glTF eye clips are shared by the website and downloadable model. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ripples = ['Backdraft', 'Double crest', 'Rolling bloom'];
  for (const viewer of document.querySelectorAll('model-viewer[data-animated-eyes]')) {
    const controls = document.querySelector(`[data-eye-controls="${viewer.id}"]`);
    const pause = controls?.querySelector('[data-eye-pause]');
    const status = controls?.querySelector('[data-eye-status]');
    let paused = reduced.matches, ready = false, onScreen = true;
    function playback() {
      if (!ready) return;
      if (paused || document.hidden || !onScreen) viewer.pause(); else viewer.play();
      if (pause) {pause.textContent = paused ? 'Play eyes' : 'Pause eyes';pause.setAttribute('aria-pressed',String(paused));}
    }
    function choose() {
      if (!ready) return;
      viewer.animationName = 'BAAABS | Eye cycle';
      viewer.animationCrossfadeDuration = 0;
      viewer.currentTime = 0;
      playback();
      updateStatus();
    }
    function updateStatus() {
      const current = Math.floor((viewer.currentTime % 16) / (16/3));
      const label = `Ovine Sauron · ${ripples[current]} · ${current+1}/3`;
      if (status && status.textContent !== label) status.textContent = label;
      viewer.dataset.eyeMode = 'ovine';
    }
    function loaded() {
      ready = viewer.availableAnimations.includes('BAAABS | Eye cycle');
      if (!ready) {if(status)status.textContent='Eye model unavailable';return;}
      if (controls) for (const el of controls.querySelectorAll('button,select')) el.disabled=false;
      choose();
    }
    viewer.addEventListener('load',loaded);
    if (viewer.loaded) loaded();
    pause?.addEventListener('click',()=>{paused=!paused;playback();});
    controls?.querySelector('[data-eye-focus]')?.addEventListener('click',()=>{
      window.revealWorkshopPanels?.();
      viewer.cameraTarget='-7.14m 5.78m 0m';viewer.cameraOrbit='-90deg 83deg 3.6m';
    });
    controls?.querySelector('[data-eye-whole]')?.addEventListener('click',()=>{
      viewer.cameraTarget='0m 3.5m 0m';viewer.cameraOrbit='-125deg 76deg 22m';
    });
    reduced.addEventListener('change',()=>{paused=reduced.matches;playback();});
    document.addEventListener('visibilitychange',playback);
    new IntersectionObserver(entries=>{onScreen=entries[0].isIntersecting;playback();}).observe(viewer);
    const timer=setInterval(()=>{if(ready && !document.hidden && onScreen)updateStatus();},250);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }
})();
