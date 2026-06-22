import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadSpine } from './loadSpine.js';

/**
 * SpineScene — owns the WebGL renderer, camera, lighting and the procedural
 * spine. It holds a mutable `state` object (camera position/target, rotation,
 * highlighted region) that the scroll controller tweens with GSAP; the render
 * loop reads that state every frame. It also self-monitors frame rate and will
 * downgrade quality, then fall back entirely, on weak hardware.
 */
export class SpineScene {
  constructor(canvas, { reducedMotion = false, onLowPerf = () => {} } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.onLowPerf = onLowPerf;
    this.disposed = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.maxDpr = reducedMotion ? 1 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070502, 0.028);

    // Image-based lighting so the clearcoat/iridescent bone reads as polished.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 14);

    this._buildLights();

    // The spine is a real loaded model, set later via loadModel(). No procedural
    // geometry is created here.
    this.spine = null;

    // Subtle ground glow plane so the spine reads against the dark field.
    const glowGeo = new THREE.CircleGeometry(9, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x2a1606,
      transparent: true,
      opacity: 0.5,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -7;
    this.scene.add(glow);

    // Mutable state driven by the scroll controller.
    this.state = {
      camX: 0, camY: 0, camZ: 14,
      tgtX: 0, tgtY: 0, tgtZ: 0,
      rotY: 0,
      highlight: 'all',
      highlightStrength: 0.5,
    };
    this._target = new THREE.Vector3();
    this._pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this._autoRot = 0;
    this._clock = new THREE.Clock();

    // Frame-rate watchdog.
    this._fpsSamples = [];
    this._slowFrames = 0;
    this._downgraded = false;

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    if (!reducedMotion) {
      this._onPointer = (e) => {
        const t = e.touches ? e.touches[0] : e;
        this._pointer.tx = (t.clientX / window.innerWidth - 0.5) * 2;
        this._pointer.ty = (t.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('pointermove', this._onPointer, { passive: true });
    }

    this.resize();
  }

  /**
   * Load the real spine model and add it to the scene. Rejects (with
   * code NO_SPINE_MODEL) when no model file is present, so the caller can show
   * the static fallback instead of any placeholder geometry.
   */
  async loadModel() {
    const spine = await loadSpine();
    this.spine = spine;
    this.scene.add(spine);
    return spine;
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x4a3520, 0.6));

    const key = new THREE.DirectionalLight(0xffd9a0, 2.2);
    key.position.set(5, 8, 8);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xf06b21, 1.4);
    rim.position.set(-6, 2, -6);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0xffc05a, 18, 40, 2);
    fill.position.set(0, 1, 6);
    this.scene.add(fill);

    const top = new THREE.SpotLight(0xfff0c8, 4, 30, Math.PI / 5, 0.5, 1.5);
    top.position.set(0, 12, 4);
    top.target.position.set(0, 0, 0);
    this.scene.add(top);
    this.scene.add(top.target);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // On narrow viewports widen the FOV so the full column stays framed.
    this.camera.fov = w < 720 ? 54 : w < 1100 ? 46 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.setSize(w, h, false);
  }

  /** Render a single frame (used for the static reduced-motion path). */
  renderOnce() {
    this._applyState(0);
    this.renderer.render(this.scene, this.camera);
  }

  _applyState(dt) {
    if (!this.spine) return;
    const s = this.state;
    // Pointer parallax — a gentle sway, disabled under reduced motion.
    if (!this.reducedMotion) {
      this._pointer.x += (this._pointer.tx - this._pointer.x) * 0.04;
      this._pointer.y += (this._pointer.ty - this._pointer.y) * 0.04;
      this._autoRot += dt * 0.12;
    }
    const parX = this._pointer.x * 0.6;
    const parY = this._pointer.y * 0.4;

    this.camera.position.set(s.camX + parX, s.camY - parY, s.camZ);
    this._target.set(s.tgtX, s.tgtY, s.tgtZ);
    this.camera.lookAt(this._target);

    this.spine.rotation.y = s.rotY + Math.sin(this._autoRot) * 0.12;
    this.spine.rotation.z = this._pointer.x * 0.02;

    this._updateHighlight();
  }

  _updateHighlight() {
    if (!this.spine) return;
    const regions = this.spine.userData.regions;
    const active = this.state.highlight;
    const strength = this.state.highlightStrength;
    for (const name of Object.keys(regions)) {
      const on = active === 'all' || active === name;
      const targetI = on ? strength : 0.04;
      for (const part of regions[name]) {
        const mat = part.material;
        mat.emissiveIntensity += (targetI - mat.emissiveIntensity) * 0.08;
      }
    }
  }

  _watchPerf(dt) {
    if (this.reducedMotion || this._downgraded) return;
    const fps = 1 / dt;
    this._fpsSamples.push(fps);
    if (this._fpsSamples.length > 60) this._fpsSamples.shift();
    if (this._fpsSamples.length < 50) return;
    const avg = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
    if (avg < 32) {
      this._slowFrames++;
      if (this._slowFrames === 1) {
        // First strike: drop pixel ratio and exposure to recover.
        this.maxDpr = 1;
        this.renderer.setPixelRatio(1);
        this._fpsSamples = [];
      } else {
        // Still slow: hand control back to the static fallback.
        this._downgraded = true;
        this.onLowPerf();
      }
    } else {
      this._slowFrames = 0;
    }
  }

  start() {
    if (this.reducedMotion) {
      this.renderOnce();
      return;
    }
    const loop = () => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(this._clock.getDelta(), 0.05);
      this._applyState(dt);
      this.renderer.render(this.scene, this.camera);
      this._watchPerf(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this._onResize);
    if (this._onPointer) window.removeEventListener('pointermove', this._onPointer);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
  }
}
