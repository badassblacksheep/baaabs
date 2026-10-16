const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 },
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

// The viewer and GLB load only after a visitor asks to explore.
const modelButton = document.querySelector('#model-launch');
const modelStage = document.querySelector('#model-stage');
const modelStatus = document.querySelector('#model-status');
if (modelButton && modelStage) {
  modelButton.addEventListener('click', async () => {
    modelButton.disabled = true;
    modelButton.textContent = 'Loading 3D…';
    modelStatus.textContent = 'Loading the model…';
    let viewer;
    try {
      await import('./assets/vendor/model-viewer-4.1.0.min.js');
      await customElements.whenDefined('model-viewer');
      viewer = document.createElement('model-viewer');
      viewer.setAttribute('alt', 'Interactive BAAABS golden design model. Rotate to inspect the sheep head, faceted body, rooftop dance floor, stairs and twin poofer masts.');
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('touch-action', 'pan-y');
      viewer.setAttribute('camera-orbit', '-36deg 68deg 85%');
      viewer.setAttribute('shadow-intensity', '1');
      viewer.setAttribute('exposure', '1.25');
      viewer.setAttribute('interaction-prompt', 'none');
      viewer.setAttribute('loading', 'eager');
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) viewer.setAttribute('autoplay', '');
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Model load timed out')), 45000);
        viewer.addEventListener('load', () => { clearTimeout(timer); resolve(); }, {once:true});
        viewer.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Model unavailable')); }, {once:true});
      });
      viewer.setAttribute('src', 'assets/models/baaabs-panelized-v14.glb');
      modelStage.append(viewer);
      await loaded;
      modelStage.classList.add('is-loaded');
      modelStatus.textContent = 'Drag to rotate · Pinch or scroll to zoom · Arrow keys to orbit';
      const motion = document.querySelector('#model-motion');
      motion.hidden = false;
      const updateMotion = () => { motion.textContent = viewer.paused ? 'Animate eyes' : 'Pause eye flames'; };
      updateMotion();
      motion.onclick = () => { if (viewer.paused) viewer.play(); else viewer.pause(); updateMotion(); };
      viewer.focus();
    } catch (error) {
      viewer?.remove();
      modelButton.disabled = false;
      modelButton.textContent = 'Try 3D again';
      modelStatus.textContent = 'The 3D view couldn’t load. You can still view the image or download the model.';
    }
  });
}
