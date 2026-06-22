import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { loadPoseTextures, createField } from './field.js';

/**
 * FieldScene — renders the glowing human + electromagnetic field centrepiece.
 *
 * A full-screen shader quad cross-fades the four supplied pose photographs as
 * the visitor scrolls (state.progress 0 → 1), so the figure and field rotate to
 * each assigned position in order. The image is post-processed with bloom,
 * vignette and a touch of film grain for a cinematic, top-tier finish.
 *
 * Self-monitors frame rate: first drops bloom + pixel ratio, then hands off to
 * the static fallback if still slow.
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
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.maxDpr = reducedMotion ? 1 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setClearColor(0x050301, 1);

    this.scene = new THREE.Scene();
    // Orthographic full-screen quad space.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.field = null;
    this.composer = null;
    this.bloomPass = null;

    this.state = { progress: 0 };
    this._clock = new THREE.Clock();
    this._t = 0;

    this._fpsSamples = [];
    this._slowFrames = 0;
    this._downgraded = false;

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  /** Load the four pose photographs and build the field + post-processing. */
  async loadModel() {
    const { textures, usingPlaceholders, missing } = await loadPoseTextures();
    this.usingPlaceholders = usingPlaceholders;
    if (usingPlaceholders) {
      console.warn(
        `[talisman] ${missing} of 4 pose images missing — using labelled ` +
        'placeholders. Add the real art at public/field/pose-1..4.webp.'
      );
    }
    this.field = createField(textures, { reducedMotion: this.reducedMotion });
    this.field.setScreenAspect(window.innerWidth / window.innerHeight);
    this.scene.add(this.field.group);
    this._buildComposer();
    return this.field;
  }

  _buildComposer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    composer.setSize(w, h);
    composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom — the core premium glow on the bright amber field.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.reducedMotion ? 0.6 : 1.05, // strength
      0.75, // radius
      0.0 // threshold (lift all of the amber glow)
    );
    composer.addPass(this.bloomPass);

    // Cinematic grade: vignette + subtle film grain in one pass.
    this.gradePass = new ShaderPass(GRADE_SHADER);
    this.gradePass.uniforms.uReduced.value = this.reducedMotion ? 1 : 0;
    composer.addPass(this.gradePass);

    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) this.bloomPass.setSize(w, h);
    if (this.field) this.field.setScreenAspect(w / h);
    if (this.gradePass) this.gradePass.uniforms.uResolution.value.set(w, h);
  }

  _renderFrame() {
    if (!this.field) return;
    this.field.setProgress(this.state.progress);
    this.field.update(this._t);
    if (this.gradePass) this.gradePass.uniforms.uTime.value = this._t;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  renderOnce() {
    this._renderFrame();
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
        // First strike: drop bloom + pixel ratio to recover.
        this.maxDpr = 1;
        this.renderer.setPixelRatio(1);
        if (this.composer) this.composer.setPixelRatio(1);
        if (this.bloomPass) this.bloomPass.strength = 0.4;
        this._fpsSamples = [];
      } else {
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
      this._t += dt;
      this._renderFrame();
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
    if (this.field) this.field.dispose();
    if (this.composer) this.composer.dispose();
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

// Vignette + animated film grain, applied after bloom.
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uReduced: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uReduced;
    uniform vec2 uResolution;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // Vignette.
      vec2 q = vUv - 0.5;
      float vig = smoothstep(1.05, 0.4, length(q) * 1.2);
      col *= mix(0.72, 1.0, vig);
      // Subtle film grain.
      if(uReduced < 0.5){
        float g = hash(vUv * uResolution + uTime * 60.0);
        col += (g - 0.5) * 0.035;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
