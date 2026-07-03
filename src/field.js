import * as THREE from 'three';

/**
 * Scroll-controlled cinematic figure sequence.
 *
 * Four supplied photographs are shown one at a time inside a single full-screen
 * canvas, in this order:  front → side → back → davinci.
 *
 * Each transition is a noise-based particle dissolve, never a crossfade and
 * never two figures at once:
 *   1. hold the current pose (gentle heart pulse)
 *   2. heart glow swells
 *   3. the figure + field erode into fine orange particles (noise threshold)
 *   4. a dark midpoint — only flowing particles and a faint central light
 *   5. the next pose re-forms from the particles
 *   6. it settles into sharp focus
 *
 * The figure quad shows the active pose sharply at rest; a GPU particle field,
 * seeded from the SAME single texture, carries the dissolve. At the transition
 * midpoint the active texture (and its normalisation + heart anchor) is swapped,
 * so only one figure is ever sampled.
 */

// Order requested by the client. Normalisation (scale / offset / heart) keeps
// the heart, feet, body scale and surrounding field centred consistently.
// Absolute paths — the site is served from a domain root (see DEPLOY.md).
const POSES = [
  { url: '/field/pose-3.webp', name: 'front', scale: 1.0, offset: [0.0, 0.0], heart: [0.5, 0.455] },
  { url: '/field/pose-1.webp', name: 'side', scale: 1.0, offset: [0.0, 0.0], heart: [0.5, 0.45] },
  { url: '/field/pose-2.webp', name: 'back', scale: 0.9, offset: [0.0, 0.0], heart: [0.5, 0.47] },
  { url: '/field/pose-4.webp', name: 'davinci', scale: 1.03, offset: [0.0, 0.02], heart: [0.5, 0.45] },
];

export const POSE_COUNT = POSES.length;

function placeholderTexture(index, label) {
  const w = 720, h = 1280;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#050301'; g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(246,140,40,${Math.max(0.16 - i * 0.008, 0.02)})`;
    g.lineWidth = 1.4; g.beginPath();
    g.ellipse(0, 0, 90 + i * 22, 150 + i * 34, 0, 0, Math.PI * 2); g.stroke();
  }
  g.shadowColor = 'rgba(255,180,70,0.9)'; g.shadowBlur = 28;
  g.strokeStyle = 'rgba(255,205,120,0.95)'; g.lineWidth = 14; g.lineCap = 'round';
  g.beginPath(); g.arc(0, -250, 30, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(0, -220); g.lineTo(0, 120); g.stroke();
  g.beginPath(); g.moveTo(0, -120); g.lineTo(-70, 70); g.moveTo(0, -120); g.lineTo(70, 70);
  g.moveTo(0, 120); g.lineTo(-45, 330); g.moveTo(0, 120); g.lineTo(45, 330); g.stroke();
  g.shadowBlur = 0; g.fillStyle = 'rgba(255,210,140,0.85)';
  g.font = '600 26px ui-monospace, monospace'; g.textAlign = 'center';
  g.fillText(`POSE ${index + 1} · ${label.toUpperCase()}`, 0, h / 2 - 120);
  g.fillText('PLACEHOLDER', 0, h / 2 - 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadPoseTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  const load = (url) =>
    new Promise((resolve) => {
      loader.load(url, (t) => resolve(t), undefined, () => resolve(null));
    });
  const raw = await Promise.all(POSES.map((p) => load(p.url)));
  let missing = 0;
  const textures = raw.map((t, i) => {
    if (!t) { missing++; t = placeholderTexture(i, POSES[i].name); }
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = maxAniso;
    t.generateMipmaps = true;
    return t;
  });
  return { textures, meta: POSES, usingPlaceholders: missing > 0, missing };
}

const NOISE = /* glsl */ `
  vec3 hash3(vec3 p){
    p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453123);
  }
  float noise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
    float n = mix(mix(mix(dot(hash3(i+vec3(0,0,0))-0.5,f-vec3(0,0,0)),
                          dot(hash3(i+vec3(1,0,0))-0.5,f-vec3(1,0,0)),f.x),
                      mix(dot(hash3(i+vec3(0,1,0))-0.5,f-vec3(0,1,0)),
                          dot(hash3(i+vec3(1,1,0))-0.5,f-vec3(1,1,0)),f.x),f.y),
                  mix(mix(dot(hash3(i+vec3(0,0,1))-0.5,f-vec3(0,0,1)),
                          dot(hash3(i+vec3(1,0,1))-0.5,f-vec3(1,0,1)),f.x),
                      mix(dot(hash3(i+vec3(0,1,1))-0.5,f-vec3(0,1,1)),
                          dot(hash3(i+vec3(1,1,1))-0.5,f-vec3(1,1,1)),f.x),f.y),f.z);
    return n*0.5+0.5;
  }
`;

// ---- Figure quad: shows the active pose, dissolving via a noise threshold ----
const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const QUAD_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uImg;        // imageAspect, screenAspect
  uniform float uScale;     // per-pose normalisation
  uniform vec2 uOffset;
  uniform vec2 uHeart;      // heart uv in image space
  uniform float uDissolve;  // 0 solid -> 1 gone
  uniform float uHeartGlow; // additive heart light
  uniform float uDOF;       // transition blur amount
  uniform float uDim;       // recede while the spinal axis leads
  uniform float uTime;
  uniform float uReduced;
  ${NOISE}

  vec2 toImg(vec2 uv){
    vec2 p = uv - 0.5;
    if(uImg.y > uImg.x){ p.x *= uImg.y / uImg.x; } else { p.y *= uImg.x / uImg.y; }
    p *= 0.9 * uScale;
    p += uOffset;
    if(uReduced < 0.5){
      float r = length(p);
      float a = 0.01 * sin(uTime*0.5 + r*6.0) * smoothstep(0.6,0.0,r);
      float s=sin(a), c=cos(a); p = mat2(c,-s,s,c)*p;
    }
    return p + 0.5;
  }

  vec3 sampleImg(vec2 iuv){
    if(iuv.x<0.0||iuv.x>1.0||iuv.y<0.0||iuv.y>1.0) return vec3(0.0);
    return texture2D(uTex, iuv).rgb;
  }

  void main(){
    vec2 iuv = toImg(vUv);
    // Mild depth-of-field during transitions (cheap 5-tap).
    vec3 col;
    if(uDOF > 0.001 && uReduced < 0.5){
      float b = uDOF * 0.006;
      col  = sampleImg(iuv);
      col += sampleImg(iuv + vec2(b,0.0));
      col += sampleImg(iuv + vec2(-b,0.0));
      col += sampleImg(iuv + vec2(0.0,b));
      col += sampleImg(iuv + vec2(0.0,-b));
      col /= 5.0;
    } else {
      col = sampleImg(iuv);
    }

    // Noise dissolve: erode the figure where the threshold passes the noise.
    float n = noise(vec3(iuv * 7.0, uTime * 0.05));
    float n2 = noise(vec3(iuv * 22.0, uTime * 0.1));
    float fld = n * 0.7 + n2 * 0.3;
    float thr = uDissolve * 1.12 - 0.06;
    float vis = smoothstep(thr, thr + 0.10, fld);
    // Burning edge glow as it dissolves.
    float edge = smoothstep(thr - 0.04, thr, fld) * (1.0 - vis);
    vec3 ember = vec3(1.0, 0.55, 0.18) * edge * 1.6 * step(0.02, uDissolve);

    // Heart light.
    float hr = length((iuv - uHeart) * vec2(uImg.x/uImg.y < 1.0 ? 1.0 : 1.0, 1.0));
    float heart = exp(-hr * hr * 26.0) * uHeartGlow;
    vec3 heartCol = vec3(1.0, 0.78, 0.4) * heart;

    vec3 outc = col * vis + ember + heartCol;
    outc *= mix(1.0, 0.45, uDim);
    gl_FragColor = vec4(outc, 1.0);
  }
`;

// ---- Particle field: seeded from the SAME texture, carries the dissolve ----
const P_VERT = /* glsl */ `
  precision highp float;
  attribute vec2 aUv;
  attribute float aSeed;
  uniform sampler2D uTex;
  uniform vec2 uImg;
  uniform float uScale;
  uniform vec2 uOffset;
  uniform float uActivity;  // 0 at rest -> 1 mid-transition
  uniform float uTime;
  uniform float uDpr;
  varying float vA;
  ${NOISE}
  vec2 toImg(vec2 uv){
    vec2 p = uv - 0.5;
    if(uImg.y > uImg.x){ p.x *= uImg.y / uImg.x; } else { p.y *= uImg.x / uImg.y; }
    p *= 0.9 * uScale; p += uOffset; return p + 0.5;
  }
  void main(){
    vec2 iuv = toImg(aUv);
    vec3 c = vec3(0.0);
    if(iuv.x>=0.0 && iuv.x<=1.0 && iuv.y>=0.0 && iuv.y<=1.0) c = texture2D(uTex, iuv).rgb;
    float lum = max(c.r, max(c.g, c.b));
    // Position in clip space from the grid uv.
    vec2 ndc = (aUv - 0.5) * 2.0;
    // Disperse: curl-ish flow upward + outward, peaking mid-transition.
    float t = uTime * 0.25 + aSeed * 6.2831;
    vec3 fl = vec3(noise(vec3(aUv*4.0, uTime*0.2+aSeed)) - 0.5,
                   noise(vec3(aUv*4.0+19.0, uTime*0.2+aSeed)) - 0.5, 0.0);
    float disp = uActivity;
    ndc += fl.xy * disp * 1.1;
    ndc.y += disp * (0.12 + aSeed * 0.3); // rise
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = (lum * 2.4 + 0.6) * uDpr * (0.6 + disp * 1.1);
    // Only visible during transition, weighted by the figure's brightness.
    vA = lum * smoothstep(0.0, 0.25, uActivity) * (1.0 - smoothstep(0.85, 1.0, uActivity)*0.2);
  }
`;
const P_FRAG = /* glsl */ `
  precision highp float;
  varying float vA;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.0, length(d));
    if(vA < 0.01) discard;
    gl_FragColor = vec4(1.0, 0.66, 0.28, vA * m);
  }
`;

function aspectOf(tex) {
  const img = tex.image;
  if (img && img.width && img.height) return img.width / img.height;
  return 0.58;
}

export function createField(textures, meta, { reducedMotion, renderer }) {
  const group = new THREE.Group();
  const screenAspect = window.innerWidth / window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

  const quadU = {
    uTex: { value: textures[0] },
    uImg: { value: new THREE.Vector2(aspectOf(textures[0]), screenAspect) },
    uScale: { value: meta[0].scale },
    uOffset: { value: new THREE.Vector2(meta[0].offset[0], meta[0].offset[1]) },
    uHeart: { value: new THREE.Vector2(meta[0].heart[0], meta[0].heart[1]) },
    uDissolve: { value: 0 },
    uHeartGlow: { value: 0.0 },
    uDOF: { value: 0 },
    uDim: { value: 0 },
    uTime: { value: 0 },
    uReduced: { value: reducedMotion ? 1 : 0 },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, uniforms: quadU, depthTest: false, depthWrite: false })
  );
  quad.frustumCulled = false;
  group.add(quad);

  // Particle grid.
  let points = null;
  const pU = {
    uTex: { value: textures[0] },
    uImg: { value: new THREE.Vector2(aspectOf(textures[0]), screenAspect) },
    uScale: { value: meta[0].scale },
    uOffset: { value: new THREE.Vector2(meta[0].offset[0], meta[0].offset[1]) },
    uActivity: { value: 0 },
    uTime: { value: 0 },
    uDpr: { value: dpr },
  };
  if (!reducedMotion) {
    const COLS = window.innerWidth < 760 ? 110 : 170;
    const ROWS = window.innerWidth < 760 ? 170 : 260;
    const n = COLS * ROWS;
    const uvs = new Float32Array(n * 2);
    const seeds = new Float32Array(n);
    let k = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        uvs[k * 2] = (x + 0.5) / COLS;
        uvs[k * 2 + 1] = (y + 0.5) / ROWS;
        seeds[k] = Math.random();
        k++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const pMat = new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG, uniforms: pU,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    points = new THREE.Points(geo, pMat);
    points.frustumCulled = false;
    group.add(points);
  }

  let activeIndex = 0;
  function setActiveTexture(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    const m = meta[i];
    quadU.uTex.value = textures[i];
    quadU.uImg.value.x = aspectOf(textures[i]);
    quadU.uScale.value = m.scale;
    quadU.uOffset.value.set(m.offset[0], m.offset[1]);
    quadU.uHeart.value.set(m.heart[0], m.heart[1]);
    pU.uTex.value = textures[i];
    pU.uImg.value.x = aspectOf(textures[i]);
    pU.uScale.value = m.scale;
    pU.uOffset.value.set(m.offset[0], m.offset[1]);
  }

  function setScreenAspect(a) {
    quadU.uImg.value.y = a;
    pU.uImg.value.y = a;
  }

  /**
   * progress 0..1 across the whole sequence. Each pose holds, then a particle
   * transition runs to the next. State: which texture is active, dissolve,
   * heart glow, DOF, particle activity.
   */
  function setProgress(progress) {
    const p = Math.min(1, Math.max(0, progress));
    const seg = p * (POSES.length - 1); // 0..3
    const i = Math.min(POSES.length - 2, Math.floor(seg));
    const f = seg - i; // 0..1 within this pair

    // Hold bands at the ends, transition in the middle.
    const HOLD = 0.32;
    let dissolve = 0, activity = 0, dof = 0, heartBase = 0.0;
    if (f < HOLD) {
      setActiveTexture(i);
      dissolve = 0; activity = 0; dof = 0;
    } else if (f > 1 - HOLD) {
      setActiveTexture(i + 1);
      dissolve = 0; activity = 0; dof = 0;
    } else {
      const lt = (f - HOLD) / (1 - 2 * HOLD); // 0..1 across the transition
      // Swap the active texture at the midpoint so only one figure shows.
      if (lt < 0.5) {
        setActiveTexture(i);
        dissolve = lt * 2.0; // 0 -> 1
      } else {
        setActiveTexture(i + 1);
        dissolve = (1.0 - lt) * 2.0; // 1 -> 0
      }
      const bell = Math.sin(Math.PI * lt);
      activity = bell;
      dof = bell;
      heartBase = 0.6 * Math.max(0, 1 - Math.abs(lt - 0.18) * 6); // swell just before dissolve
    }

    quadU.uDissolve.value = dissolve;
    quadU.uDOF.value = dof;
    pU.uActivity.value = activity;
    quadU._heartBase = heartBase;
    quadU._holding = f < HOLD || f > 1 - HOLD;
  }

  // Intro ignition: heart lights from 0, particles rise. Driven externally.
  function setIntro(v) {
    quadU._intro = v; // 0..1
  }

  function update(time) {
    quadU.uTime.value = time;
    pU.uTime.value = time;
    // Heart pulse while holding + transition swell + intro ignition.
    const pulse = 0.18 + 0.07 * Math.sin(time * 1.7);
    const hold = quadU._holding ? pulse : (quadU._heartBase || 0);
    const intro = quadU._intro != null ? quadU._intro : 1;
    quadU.uHeartGlow.value = Math.max(hold, quadU._heartBase || 0) * intro;
  }

  function heartScreenPos() {
    // Convert active heart uv to screen-space 0..1 for the god-ray pass.
    const m = meta[activeIndex];
    const imgA = aspectOf(textures[activeIndex]);
    const scrA = quadU.uImg.value.y;
    let px = (m.heart[0] - 0.5), py = (m.heart[1] - 0.5);
    // invert toImg mapping (no swirl): p = (uv-0.5)*scaleFactor + offset
    px -= m.offset[0]; py -= m.offset[1];
    px /= 0.9 * m.scale; py /= 0.9 * m.scale;
    if (scrA > imgA) px *= imgA / scrA; else py *= imgA / scrA;
    return new THREE.Vector2(px + 0.5, 1.0 - (py + 0.5));
  }

  function dispose() {
    quad.geometry.dispose();
    quad.material.dispose();
    if (points) { points.geometry.dispose(); points.material.dispose(); }
  }

  function getActivity() { return pU.uActivity.value; }
  function getHeartGlow() { return quadU.uHeartGlow.value; }
  function setDim(v) { quadU.uDim.value = Math.max(0, Math.min(1, v)); }

  return {
    group, setProgress, setScreenAspect, setIntro, update, heartScreenPos, dispose,
    getActivity, getHeartGlow, setDim,
    get activeIndex() { return activeIndex; },
  };
}
