import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { loadPoseTextures, createField } from './field.js';
import { SpineAxis } from './axis.js';

/**
 * FieldScene — single sticky canvas hosting the figure sequence + the full
 * cinematic post chain: bloom, heart god-rays, vignette/grain grade, and SMAA.
 */
export class SpineScene {
  constructor(canvas, { reducedMotion = false, onLowPerf = () => {} } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.onLowPerf = onLowPerf;
    this.disposed = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.maxDpr = reducedMotion ? 1 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setClearColor(0x050301, 1);

    this.scene = new THREE.Scene();
    // Perspective camera for the 3D spinal axis; the body-field quad renders in
    // clip space and fills the screen regardless of camera.
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0.4, 1.3, 11);
    this.camera.lookAt(0, 0, 0);

    this.field = null;
    this.axis = null;
    this.composer = null;
    this.bloomPass = null;
    this.godrayPass = null;
    this.gradePass = null;

    this.state = { progress: 0, targetProgress: 0, intro: reducedMotion ? 1 : 0 };
    // Spinal-axis narrative parameters, tweened by the scroll system.
    this.axisState = { visibility: 0, decompression: 0, fascia: 0, pulses: 0, rotY: 0, dim: 0 };
    this._clock = new THREE.Clock();
    this._t = 0;
    this._fpsSamples = [];
    this._slowFrames = 0;
    this._downgraded = false;

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  async loadModel() {
    const { textures, meta, usingPlaceholders, missing } = await loadPoseTextures(this.renderer);
    this.usingPlaceholders = usingPlaceholders;
    if (usingPlaceholders) {
      console.warn(`[talisman] ${missing}/4 pose images missing — placeholders used. Add public/field/pose-*.webp.`);
    }
    this.field = createField(textures, meta, { reducedMotion: this.reducedMotion, renderer: this.renderer });
    this.field.setScreenAspect(window.innerWidth / window.innerHeight);
    this.field.setIntro(this.reducedMotion ? 1 : 0);
    this.scene.add(this.field.group);

    this.axis = new SpineAxis({ reducedMotion: this.reducedMotion });
    this.scene.add(this.axis.group);
    if (this.reducedMotion) {
      // Static cinematic frame: axis present with fascia, no motion layers.
      Object.assign(this.axisState, { visibility: 0.75, decompression: 0.35, fascia: 0.4, pulses: 0, rotY: 0.4, dim: 0.35 });
    }

    this._buildComposer();
    return this.field;
  }

  _buildComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), this.reducedMotion ? 0.45 : 0.55, 0.7, 0.18);
    composer.addPass(this.bloomPass);

    if (!this.reducedMotion) {
      this.godrayPass = new ShaderPass(GODRAY_SHADER);
      this.godrayPass.uniforms.uLightPos.value.set(0.5, 0.52);
      this.godrayPass.uniforms.uStrength.value = 0.16;
      composer.addPass(this.godrayPass);
    }

    this.gradePass = new ShaderPass(GRADE_SHADER);
    this.gradePass.uniforms.uReduced.value = this.reducedMotion ? 1 : 0;
    this.gradePass.uniforms.uResolution.value.set(w, h);
    composer.addPass(this.gradePass);

    if (!this.reducedMotion) {
      this.smaaPass = new SMAAPass(w * dpr, h * dpr);
      composer.addPass(this.smaaPass);
    }

    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.camera.aspect = w / h;
    // Widen the view slightly on narrow screens so the axis stays framed.
    this.camera.fov = w < 720 ? 52 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(w, h); }
    if (this.bloomPass) this.bloomPass.setSize(w, h);
    if (this.smaaPass) this.smaaPass.setSize(w * dpr, h * dpr);
    if (this.gradePass) this.gradePass.uniforms.uResolution.value.set(w, h);
    if (this.field) this.field.setScreenAspect(w / h);
  }

  _renderFrame(dt = 0) {
    if (!this.field) return;
    this.field.setProgress(this.state.progress);
    this.field.setIntro(this.state.intro);
    this.field.setDim(this.axisState.dim);
    this.field.update(this._t);
    if (this.axis) {
      Object.assign(this.axis.state, this.axisState);
      this.axis.update(this._t, dt);
    }
    if (this.gradePass) {
      this.gradePass.uniforms.uTime.value = this._t;
      this.gradePass.uniforms.uShift.value = this.field.getActivity();
    }
    if (this.godrayPass) {
      this.godrayPass.uniforms.uLightPos.value.copy(this.field.heartScreenPos());
      this.godrayPass.uniforms.uHeart.value = this.field.getHeartGlow();
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  renderOnce() { this._renderFrame(); }

  _watchPerf(dt) {
    if (this.reducedMotion || this._downgraded) return;
    this._fpsSamples.push(1 / dt);
    if (this._fpsSamples.length > 60) this._fpsSamples.shift();
    if (this._fpsSamples.length < 50) return;
    const avg = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
    if (avg < 30) {
      this._slowFrames++;
      if (this._slowFrames === 1) {
        this.maxDpr = 1; this.renderer.setPixelRatio(1);
        if (this.composer) this.composer.setPixelRatio(1);
        if (this.bloomPass) this.bloomPass.strength = 0.5;
        if (this.godrayPass) this.godrayPass.uniforms.uStrength.value = 0;
        if (this.axis) this.axis.simplify();
        this._fpsSamples = [];
      } else { this._downgraded = true; this.onLowPerf(); }
    } else { this._slowFrames = 0; }
  }

  start() {
    if (this.reducedMotion) { this.renderOnce(); return; }
    const loop = () => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(this._clock.getDelta(), 0.05);
      this._t += dt;
      // Ease the figure progress toward the scroll target so fast or held
      // scrolling transitions the figure smoothly and slowly, not in a blur.
      // A speed cap guarantees a minimum transition time regardless of how fast
      // the user drags the scrollbar.
      const k = 1 - Math.exp(-dt / 0.34);
      let step = (this.state.targetProgress - this.state.progress) * k;
      const maxStep = 0.5 * dt; // ≤ half the sequence per second
      if (step > maxStep) step = maxStep;
      else if (step < -maxStep) step = -maxStep;
      this.state.progress += step;
      this._renderFrame(dt);
      this._watchPerf(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }

  dispose() {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this._onResize);
    if (this.field) this.field.dispose();
    if (this.axis) this.axis.dispose();
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
  }
}

// Radial god-rays from the heart (volumetric light scattering, all orange).
const GODRAY_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uLightPos: { value: new THREE.Vector2(0.5, 0.52) },
    uStrength: { value: 0.5 },
    uHeart: { value: 0.0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uLightPos; uniform float uStrength; uniform float uHeart;
    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 dir = (uLightPos - vUv);
      const int N = 24;
      vec2 step = dir / float(N) * 0.85;
      vec2 uv = vUv; float decay = 1.0; float accum = 0.0;
      for(int i=0;i<N;i++){
        uv += step;
        vec3 s = texture2D(tDiffuse, uv).rgb;
        accum += max(s.r, max(s.g, s.b)) * decay;
        decay *= 0.93;
      }
      accum /= float(N);
      float str = uStrength * (0.5 + uHeart);
      vec3 rays = vec3(1.0, 0.62, 0.26) * accum * str;
      gl_FragColor = vec4(base + rays, 1.0);
    }
  `,
};

// Vignette + animated film grain + almost-invisible edge RGB shift at midpoint.
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uReduced: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uShift: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime; uniform float uReduced; uniform vec2 uResolution; uniform float uShift;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 q = vUv - 0.5;
      vec3 col;
      // Almost-invisible chromatic edge shift, only with uShift (transition midpoint).
      float amt = uShift * 0.0016 * length(q) * 2.0;
      if(amt > 0.00001 && uReduced < 0.5){
        col.r = texture2D(tDiffuse, vUv + q*amt).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - q*amt).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      float vig = smoothstep(1.05, 0.4, length(q)*1.2);
      col *= mix(0.72, 1.0, vig);
      if(uReduced < 0.5){
        float g = hash(vUv*uResolution + uTime*60.0);
        col += (g-0.5)*0.03;
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
