import * as THREE from 'three';

/**
 * The centrepiece: the glowing human figure inside a circular electromagnetic
 * (torus) field. It is driven by four supplied photographs — one per pose —
 * that the visitor scrolls through in order:
 *
 *     /field/pose-1.jpg   side profile
 *     /field/pose-2.jpg   rear view, arms at sides
 *     /field/pose-3.jpg   front view
 *     /field/pose-4.jpg   Vitruvian (arms / legs spread)
 *
 * As scroll progress runs 0 → 1 the figure and field rotate to each assigned
 * pose with a flowing cross-fade (plus a subtle field shimmer). The images are
 * shown "contained" on black, so the dark margins are invisible against the
 * scene background.
 *
 * If a photo is missing, a clearly-labelled placeholder is generated so the
 * motion is visible — replace the files in public/field/ with the real art.
 */

export const POSE_URLS = [
  '/field/pose-1.webp',
  '/field/pose-2.webp',
  '/field/pose-3.webp',
  '/field/pose-4.webp',
];

const POSE_LABELS = ['SIDE PROFILE', 'REAR VIEW', 'FRONT VIEW', 'VITRUVIAN'];

/** Draw a labelled placeholder pose (glowing humanoid + torus rings on black). */
function placeholderTexture(index) {
  const w = 720;
  const h = 1280;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#050301';
  g.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // Torus field rings.
  g.save();
  g.translate(cx, cy);
  for (let i = 0; i < 14; i++) {
    const rx = 90 + i * 22;
    const ry = 150 + i * 34;
    const a = 0.16 - i * 0.008;
    g.strokeStyle = `rgba(246,140,40,${Math.max(a, 0.02)})`;
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // Pole flares.
  const flare = g.createRadialGradient(0, -ry(), 0, 0, -ry(), 120);
  function ry() { return 150 + 13 * 34; }
  flare.addColorStop(0, 'rgba(255,200,90,0.5)');
  flare.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = flare;
  g.beginPath();
  g.arc(0, -ry(), 120, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(0, ry(), 120, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Glowing humanoid silhouette, varied per pose.
  g.save();
  g.translate(cx, cy);
  g.shadowColor = 'rgba(255,180,70,0.9)';
  g.shadowBlur = 28;
  g.strokeStyle = 'rgba(255,205,120,0.95)';
  g.fillStyle = 'rgba(255,190,90,0.5)';
  g.lineWidth = 14;
  g.lineCap = 'round';
  const head = -250;
  // Head
  g.beginPath();
  g.arc(0, head, 30, 0, Math.PI * 2);
  g.fill();
  // Torso
  g.beginPath();
  g.moveTo(0, head + 30);
  g.lineTo(0, 120);
  g.stroke();
  if (index === 3) {
    // Vitruvian: arms + legs spread.
    g.beginPath(); g.moveTo(0, -120); g.lineTo(-180, -200); g.moveTo(0, -120); g.lineTo(180, -200);
    g.moveTo(0, -90); g.lineTo(-200, -60); g.moveTo(0, -90); g.lineTo(200, -60);
    g.moveTo(0, 120); g.lineTo(-150, 320); g.moveTo(0, 120); g.lineTo(150, 320); g.stroke();
  } else if (index === 0) {
    // Side profile: arms/legs together, slight offset.
    g.beginPath(); g.moveTo(0, -120); g.lineTo(40, 40); g.moveTo(0, 120); g.lineTo(20, 330); g.stroke();
  } else {
    // Front / rear: arms down, legs together.
    g.beginPath(); g.moveTo(0, -120); g.lineTo(-70, 70); g.moveTo(0, -120); g.lineTo(70, 70);
    g.moveTo(0, 120); g.lineTo(-45, 330); g.moveTo(0, 120); g.lineTo(45, 330); g.stroke();
  }
  // Heart spark.
  const spark = g.createRadialGradient(0, -60, 0, 0, -60, 60);
  spark.addColorStop(0, 'rgba(255,240,200,0.95)');
  spark.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = spark;
  g.shadowBlur = 0;
  g.beginPath(); g.arc(0, -60, 60, 0, Math.PI * 2); g.fill();
  g.restore();

  // Label.
  g.fillStyle = 'rgba(255,210,140,0.85)';
  g.font = '600 26px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(`POSE ${index + 1} · ${POSE_LABELS[index]}`, cx, h - 90);
  g.fillStyle = 'rgba(204,181,154,0.7)';
  g.font = '18px ui-monospace, monospace';
  g.fillText('PLACEHOLDER — replace in public/field/', cx, h - 58);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Load the four pose photographs; substitute a labelled placeholder if missing. */
export async function loadPoseTextures() {
  const loader = new THREE.TextureLoader();
  const load = (url) =>
    new Promise((resolve) => {
      loader.load(
        url,
        (t) => { t.colorSpace = THREE.SRGBColorSpace; resolve({ tex: t, real: true }); },
        undefined,
        () => resolve(null)
      );
    });

  const results = await Promise.all(POSE_URLS.map(load));
  let placeholders = 0;
  const textures = results.map((r, i) => {
    if (r && r.real) return r.tex;
    placeholders++;
    return placeholderTexture(i);
  });
  return { textures, usingPlaceholders: placeholders > 0, missing: placeholders };
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform float uMix;
  uniform float uTime;
  uniform float uReduced;
  uniform vec2 uAspectA; // imageAspect, screenAspect
  uniform vec2 uAspectB;

  // Contain-fit: keep the whole portrait visible, black (=invisible) margins.
  vec4 sampleContain(sampler2D tex, vec2 uv, float imgA, float scrA, float t){
    vec2 p = uv - 0.5;
    if(scrA > imgA){ p.x *= scrA / imgA; } else { p.y *= imgA / scrA; }
    p *= 0.88; // slight zoom so the figure + torus read larger
    // Subtle field shimmer: swirl that grows toward the centre.
    if(uReduced < 0.5){
      float r = length(p);
      float ang = 0.012 * sin(uTime*0.6 + r*7.0) * smoothstep(0.55, 0.0, r);
      float s = sin(ang), c = cos(ang);
      p = mat2(c,-s,s,c) * p;
    }
    vec2 iuv = p + 0.5;
    if(iuv.x < 0.0 || iuv.x > 1.0 || iuv.y < 0.0 || iuv.y > 1.0) return vec4(0.0);
    return texture2D(tex, iuv);
  }

  void main(){
    vec4 a = sampleContain(uTexA, vUv, uAspectA.x, uAspectA.y, uTime);
    vec4 b = sampleContain(uTexB, vUv, uAspectB.x, uAspectB.y, uTime);
    vec3 col = mix(a.rgb, b.rgb, uMix);
    col *= 1.18; // lift the figure / field glow
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createField(textures, { reducedMotion }) {
  const group = new THREE.Group();

  const uniforms = {
    uTexA: { value: textures[0] },
    uTexB: { value: textures[1] },
    uMix: { value: 0 },
    uTime: { value: 0 },
    uReduced: { value: reducedMotion ? 1 : 0 },
    uAspectA: { value: new THREE.Vector2(aspectOf(textures[0]), 1) },
    uAspectB: { value: new THREE.Vector2(aspectOf(textures[1]), 1) },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  group.add(quad);

  // Drifting ember particles (additive) for life over the field.
  const COUNT = reducedMotion ? 0 : 140;
  let points = null;
  if (COUNT > 0) {
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() * 2 - 1);
      pos[i * 3 + 1] = (Math.random() * 2 - 1);
      pos[i * 3 + 2] = 0;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; varying float vA; uniform float uTime;
        void main(){
          vec3 p = position;
          float t = uTime * (0.05 + aSeed*0.08);
          p.y = mod(p.y + t, 2.0) - 1.0;
          p.x += sin(uTime*0.3 + aSeed*6.28) * 0.04;
          vA = 0.25 + 0.6 * aSeed;
          gl_Position = vec4(p.xy, 0.0, 1.0);
          gl_PointSize = (1.0 + aSeed*2.2);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float m = smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4(1.0, 0.72, 0.32, vA*m);
        }`,
    });
    points = new THREE.Points(geo, pMat);
    points.frustumCulled = false;
    group.add(points);
  }

  function setScreenAspect(a) {
    uniforms.uAspectA.value.y = a;
    uniforms.uAspectB.value.y = a;
  }

  /** progress 0..1 maps across the four poses in order. */
  function setProgress(progress) {
    const p = Math.min(1, Math.max(0, progress));
    const seg = p * (textures.length - 1);
    const i = Math.min(textures.length - 2, Math.floor(seg));
    const f = seg - i;
    if (uniforms.uTexA.value !== textures[i]) {
      uniforms.uTexA.value = textures[i];
      uniforms.uAspectA.value.x = aspectOf(textures[i]);
    }
    if (uniforms.uTexB.value !== textures[i + 1]) {
      uniforms.uTexB.value = textures[i + 1];
      uniforms.uAspectB.value.x = aspectOf(textures[i + 1]);
    }
    uniforms.uMix.value = smooth(f);
  }

  function update(time) {
    uniforms.uTime.value = time;
    if (points) points.material.uniforms.uTime.value = time;
  }

  function dispose() {
    quad.geometry.dispose();
    mat.dispose();
    if (points) { points.geometry.dispose(); points.material.dispose(); }
  }

  return { group, setProgress, setScreenAspect, update, dispose };
}

function aspectOf(tex) {
  const img = tex.image;
  if (img && img.width && img.height) return img.width / img.height;
  return 0.5625; // default portrait 9:16
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}
