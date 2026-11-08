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

(() => {
  const button = document.querySelector('#push-it');
  if (!button) return;
  const soundtrack = document.querySelector('#earl-soundtrack');
  let frame, player, playing = false, ready = false;

  function setPlaying(value) {
    playing = value;
    button.textContent = value ? 'Ⅱ Pause' : '▶ Push It';
    button.setAttribute('aria-label', value ? 'Pause Push It' : 'Play Push It');
  }

  function openPlayer() {
    soundtrack.hidden = false;
    frame = document.createElement('iframe');
    frame.title = 'Push It — Disco Lines & Maesic feat. Mason & Princess Superstar';
    frame.allow = 'autoplay; encrypted-media; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = 'https://www.youtube-nocookie.com/embed/xzxx3iW8DiQ?autoplay=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    document.querySelector('#track-screen').replaceChildren(frame);
    function connect() {
      player = new YT.Player(frame, {events: {
        onReady() { ready = true; },
        onStateChange(event) {
          if (event.data === YT.PlayerState.PLAYING) setPlaying(true);
          if ([YT.PlayerState.PAUSED, YT.PlayerState.ENDED].includes(event.data)) setPlaying(false);
        },
        onAutoplayBlocked() { setPlaying(false); },
        onError() { ready = false; setPlaying(false); }
      }});
    }
    if (window.YT?.Player) connect();
    else {
      window.onYouTubeIframeAPIReady = connect;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.append(script);
    }
  }

  button.addEventListener('click', () => {
    if (!frame) openPlayer();
    else if (ready && playing) player.pauseVideo();
    else if (ready) player.playVideo();
    else frame.focus();
  });
  window.addEventListener('pagehide', () => { if (ready) player.pauseVideo(); });
})();
