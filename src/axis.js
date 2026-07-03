import * as THREE from 'three';

/**
 * SpineAxis — the central anatomical system.
 *
 * An abstract spinal axis: a luminous central core, seventeen vertebral rings
 * stacked on a subtle S-curve, a fascial web of connecting lines, and nerve
 * pulses travelling the column (the single muted-cobalt accent in an otherwise
 * bone/bronze/ember palette). Deliberately abstract — mythic and clinical,
 * never cartoon bone.
 *
 * Everything is driven by a small parameter set the scroll system tweens:
 *   visibility     0..1  overall presence (opacity + scale)
 *   decompression  0..1  spacing between rings (joint space opening)
 *   fascia         0..1  fascial web opacity
 *   pulses         0..1  nerve-pulse intensity
 *   rotY           rad   column rotation
 *
 * The whole system is a few thousand triangles and ~40 draw calls — cheap
 * enough for mobile GPUs, and it degrades (fascia + pulses off) on low perf.
 */

const RING_COUNT = 17;
const BASE_SPACING = 0.36;
const CURVE_AMP = 0.22;

const BONE = new THREE.Color(0xe8dcc6);
const BRONZE = new THREE.Color(0x8c5a2b);
const EMBER = new THREE.Color(0xf06b21);
const COBALT = new THREE.Color(0x5d7fb8);

function curveX(u) {
  // Subtle S-curve, u in 0..1 bottom→top.
  return Math.sin(u * Math.PI * 1.15) * CURVE_AMP;
}

export class SpineAxis {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.group = new THREE.Group();
    this.state = { visibility: 0, decompression: 0, fascia: 0, pulses: 0, rotY: 0 };
    this._lastDecomp = -1;
    this._autoRot = 0;

    this._buildRings();
    this._buildCore();
    this._buildFascia();
    this._buildPulses();

    this.group.visible = false;
  }

  _buildRings() {
    this.rings = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const u = i / (RING_COUNT - 1);
      // Larger toward the lumbar base, smallest at the cervical top.
      const r = 0.34 + (1 - u) * 0.42;
      const geo = new THREE.TorusGeometry(r, 0.028 + (1 - u) * 0.016, 8, 40);
      const mat = new THREE.MeshBasicMaterial({
        // Warm bone→bronze so bloom lifts them amber, never clinical white.
        color: BONE.clone().lerp(BRONZE, 0.45 + (1 - u) * 0.22),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      // Stack like discs (hole facing up), with a slight forward tilt so the
      // rings read as ellipses rather than edge-on lines.
      ring.rotation.x = Math.PI / 2 - 0.16 + Math.sin(u * Math.PI) * 0.05;
      ring.rotation.z = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.14;
      ring.userData.u = u;
      ring.userData.r = r;
      this.rings.push(ring);
      this.group.add(ring);
    }
  }

  _buildCore() {
    const h = (RING_COUNT - 1) * BASE_SPACING * 1.5;
    const geo = new THREE.CylinderGeometry(0.014, 0.014, h, 8, 1, true);
    this.core = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: BONE.clone().lerp(EMBER, 0.25),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    this.group.add(this.core);
  }

  _buildFascia() {
    // Web of lines: ring-edge to ring-edge two segments up (alternating sides),
    // plus shoulder / pelvis anchor lines. Rebuilt when decompression changes.
    this._fasciaSegments = [];
    for (let i = 0; i + 2 < RING_COUNT; i++) {
      this._fasciaSegments.push({ a: i, b: i + 2, sideA: i % 2 ? 1 : -1, sideB: i % 2 ? -1 : 1 });
    }
    const anchorCount = 4;
    const segCount = this._fasciaSegments.length + anchorCount;
    this._fasciaPositions = new Float32Array(segCount * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._fasciaPositions, 3));
    this.fascia = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x9a6a33, transparent: true, opacity: 0, depthWrite: false })
    );
    this.group.add(this.fascia);
  }

  _buildPulses() {
    const N = 26;
    const offsets = new Float32Array(N);
    const speeds = new Float32Array(N);
    for (let i = 0; i < N; i++) { offsets[i] = Math.random(); speeds[i] = 0.7 + Math.random() * 0.8; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this._pulseUniforms = {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uHeight: { value: (RING_COUNT - 1) * BASE_SPACING },
      uColor: { value: COBALT },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this._pulseUniforms,
      vertexShader: /* glsl */ `
        attribute float aOffset; attribute float aSpeed;
        uniform float uTime; uniform float uHeight;
        varying float vFade;
        void main(){
          float p = fract(uTime * 0.07 * aSpeed + aOffset);
          float y = (p - 0.5) * uHeight;
          float x = sin(p * 3.14159 * 1.15) * ${CURVE_AMP.toFixed(3)};
          vec4 mv = modelViewMatrix * vec4(x, y, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 130.0 / max(1.0, -mv.z);
          vFade = smoothstep(0.0, 0.12, p) * (1.0 - smoothstep(0.88, 1.0, p));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform vec3 uColor; varying float vFade;
        void main(){
          float m = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(uColor, uAlpha * vFade * m);
        }`,
    });
    this.pulses = new THREE.Points(geo, mat);
    this.pulses.frustumCulled = false;
    this.group.add(this.pulses);
  }

  /** Drop the decorative layers on weak hardware. */
  simplify() {
    this.fascia.visible = false;
    this.pulses.visible = false;
  }

  _layout(decomp) {
    const spacing = BASE_SPACING * (1 + decomp * 0.4);
    const half = ((RING_COUNT - 1) * spacing) / 2;
    for (let i = 0; i < RING_COUNT; i++) {
      const ring = this.rings[i];
      const u = ring.userData.u;
      ring.position.set(curveX(u), i * spacing - half, 0);
    }
    this._pulseUniforms.uHeight.value = (RING_COUNT - 1) * spacing;
    // Rebuild fascia lines against the new ring positions.
    const pos = this._fasciaPositions;
    let k = 0;
    for (const seg of this._fasciaSegments) {
      const A = this.rings[seg.a]; const B = this.rings[seg.b];
      pos[k++] = A.position.x + A.userData.r * seg.sideA; pos[k++] = A.position.y; pos[k++] = 0;
      pos[k++] = B.position.x + B.userData.r * seg.sideB; pos[k++] = B.position.y; pos[k++] = 0;
    }
    // Shoulder + pelvis anchors.
    const top = this.rings[RING_COUNT - 3];
    const bottom = this.rings[2];
    for (const [ring, sx] of [[top, -1.35], [top, 1.35], [bottom, -1.15], [bottom, 1.15]]) {
      pos[k++] = ring.position.x; pos[k++] = ring.position.y; pos[k++] = 0;
      pos[k++] = sx; pos[k++] = ring.position.y - 0.35; pos[k++] = 0;
    }
    this.fascia.geometry.attributes.position.needsUpdate = true;
  }

  update(t, dt) {
    const s = this.state;
    const vis = Math.max(0, Math.min(1, s.visibility));
    this.group.visible = vis > 0.015;
    if (!this.group.visible) return;

    if (Math.abs(s.decompression - this._lastDecomp) > 0.004) {
      this._layout(s.decompression);
      this._lastDecomp = s.decompression;
    }

    if (!this.reducedMotion) this._autoRot += dt * 0.1;
    this.group.rotation.y = s.rotY + Math.sin(this._autoRot) * 0.16;
    const sc = 0.92 + vis * 0.08;
    this.group.scale.setScalar(sc);

    for (const ring of this.rings) ring.material.opacity = vis * 0.8;
    this.core.material.opacity = vis * 0.42;
    this.fascia.material.opacity = vis * s.fascia * 0.55;
    this._pulseUniforms.uTime.value = t;
    this._pulseUniforms.uAlpha.value = vis * s.pulses * 0.85;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
