/* Native glTF eye clips are shared by the website and downloadable model. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const names = {cycle:'Eye cycle',ovine:'Ovine',rainbow:'Rainbow',anime:'Anime',otaku:'Otaku',sauron:'Sauron'};
  const labels = {ovine:'Ovine · horizontal pupils',rainbow:'RGB rainbow · sheep pupils',anime:'Anime · soft and curious',otaku:'Otaku · starry-eyed',sauron:'Sauron · ancient evil'};
  const sequence = [[7,'ovine'],[14,'rainbow'],[21,'anime'],[28,'otaku'],[31,'sauron'],[36,'anime']];
  for (const viewer of document.querySelectorAll('model-viewer[data-animated-eyes]')) {
    const controls = document.querySelector(`[data-eye-controls="${viewer.id}"]`);
    const select = controls?.querySelector('[data-eye-mode]');
    const pause = controls?.querySelector('[data-eye-pause]');
    const status = controls?.querySelector('[data-eye-status]');
    let mode = 'cycle', paused = reduced.matches, ready = false, onScreen = true;
    function playback() {
      if (!ready) return;
      if (paused || document.hidden || !onScreen) viewer.pause(); else viewer.play();
      if (pause) {pause.textContent = paused ? 'Play eyes' : 'Pause eyes';pause.setAttribute('aria-pressed',String(paused));}
    }
    function choose(value) {
      mode = value;
      if (!ready) return;
      viewer.animationName = 'BAAABS | '+names[mode];
      viewer.animationCrossfadeDuration = 0;
      viewer.currentTime = 0;
      playback();
      if (select) select.value = mode;
      updateStatus();
    }
    function updateStatus() {
      const current = mode === 'cycle' ? sequence.find(([end])=>viewer.currentTime%36<end)?.[1] || 'ovine' : mode;
      if (status && status.textContent !== labels[current]) status.textContent = labels[current];
      viewer.dataset.eyeMode = current;
    }
    function loaded() {
      ready = viewer.availableAnimations.includes('BAAABS | Eye cycle');
      if (!ready) {if(status)status.textContent='Eye model unavailable';return;}
      if (controls) for (const el of controls.querySelectorAll('button,select')) el.disabled=false;
      choose(mode);
    }
    viewer.addEventListener('load',loaded);
    if (viewer.loaded) loaded();
    select?.addEventListener('change',()=>choose(select.value));
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
