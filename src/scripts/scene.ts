import * as THREE from 'three';

/**
 * Lightweight hero scene: wireframe core + particle shell + rings.
 * Performance rules:
 *  - DPR capped (1.5 mobile / 1.75 desktop)
 *  - fewer particles on small screens
 *  - paused when the canvas is off-screen or the tab is hidden
 *  - single static frame when the user prefers reduced motion
 */
export function initHeroScene(canvas: HTMLCanvasElement): () => void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = window.matchMedia('(max-width: 860px)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    console.warn('[fza3ha] WebGL not available', error);
    return () => {};
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7.4);

  const group = new THREE.Group();
  scene.add(group);

  /* wireframe shell */
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2, 1)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }),
  );
  group.add(wire);

  /* dark occluder gives the wireframe real depth */
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.97, 1),
    new THREE.MeshBasicMaterial({ color: 0x050607, transparent: true, opacity: 0.94 }),
  );
  group.add(shell);

  /* soft inner light */
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(core);

  /* orbit rings */
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(2.72, 0.006, 6, 180),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24 }),
  );
  ring1.rotation.set(Math.PI / 2.55, 0.32, 0);
  group.add(ring1);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(3.16, 0.004, 6, 180),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 }),
  );
  ring2.rotation.set(Math.PI / 1.85, -0.42, 0.3);
  group.add(ring2);

  /* particle shell */
  const count = small ? 380 : 1000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 2.35 + Math.random() * 2.1;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: small ? 0.03 : 0.022,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(points);

  /* sizing */
  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  /* pointer parallax */
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const onPointer = (event: PointerEvent) => {
    targetX = (event.clientY / window.innerHeight - 0.5) * 0.5;
    targetY = (event.clientX / window.innerWidth - 0.5) * 0.7;
  };
  if (!reduceMotion) window.addEventListener('pointermove', onPointer, { passive: true });

  /* pause when not visible */
  let visible = true;
  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      visible = entry ? entry.isIntersecting : true;
    },
    { threshold: 0.02 },
  );
  visibilityObserver.observe(canvas);

  const startedAt = performance.now();
  let frameId = 0;
  let alive = true;

  const render = () => {
    renderer.render(scene, camera);
  };

  const tick = () => {
    if (!alive) return;
    frameId = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;

    const time = (performance.now() - startedAt) / 1000;
    currentX += (targetX - currentX) * 0.045;
    currentY += (targetY - currentY) * 0.045;

    group.rotation.x = currentX + Math.sin(time * 0.24) * 0.08;
    group.rotation.y = time * 0.085 + currentY;
    group.scale.setScalar(1 + Math.sin(time * 0.5) * 0.012);

    ring1.rotation.z = time * 0.1;
    ring2.rotation.z = -time * 0.07;
    points.rotation.y = time * 0.018;

    render();
  };

  render();
  canvas.classList.add('is-live');

  if (!reduceMotion) tick();
  else {
    group.rotation.set(0.28, -0.4, 0);
    render();
  }

  const cleanup = () => {
    alive = false;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.removeEventListener('pointermove', onPointer);
    renderer.dispose();
  };

  window.addEventListener('pagehide', cleanup, { once: true });

  return cleanup;
}
