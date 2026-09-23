import * as THREE from 'three';

// Port of dizident-godot/shaders/atmosphere.gdshader. The painting is shaded in its own
// sRGB space (no colour management, no tone mapping), exactly like the Godot canvas item.
const fragment = /* glsl */ `
uniform sampler2D map;
uniform float night_time, lamp_amount, stove_amount, stair_energy;
uniform bool corridor;
varying vec2 vUv;

float area(vec2 p, vec2 lo, vec2 hi, float edge) {
  vec2 a = smoothstep(lo-vec2(edge), lo+vec2(edge), p);
  vec2 b = 1.0-smoothstep(hi-vec2(edge), hi+vec2(edge), p);
  return a.x*a.y*b.x*b.y;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 w = f*f*(3.0-2.0*f);
  return mix(mix(hash(cell), hash(cell+vec2(1,0)), w.x), mix(hash(cell+vec2(0,1)), hash(cell+vec2(1,1)), w.x), w.y);
}
float fbm(vec2 p) { return noise(p)*0.57+noise(p*2.07+vec2(17,3))*0.28+noise(p*4.13)*0.15; }

void main() {
  vec4 original = texture2D(map, vUv);
  vec2 p = vec2(vUv.x, 1.0-vUv.y)*vec2(1280.0,720.0);
  float window_mask; vec2 source;
  if (corridor) {
    window_mask = area(p, vec2(61,129), vec2(117,404), 7.0);
    source = vec2(606,133);
  } else {
    window_mask = max(area(p, vec2(594,204), vec2(689,399), 4.0), area(p, vec2(707,204), vec2(808,399), 4.0));
    source = vec2(381,379);
  }
  float cold_spill = exp(-length((p-(corridor?vec2(84,365):vec2(700,400)))/vec2(180,290)));
  vec3 dark = original.rgb*(vec3(0.10,0.19,0.29)+cold_spill*vec3(0.09,0.14,0.19));
  dark = mix(dark, original.rgb, window_mask);
  vec3 col = dark+(original.rgb-dark)*lamp_amount;
  float wick = area(p, source-vec2(corridor?9.0:8.0,14.0), source+vec2(9,10), 5.0);
  col *= 1.0-wick*(1.0-min(lamp_amount,1.0))*0.86;
  float halo = exp(-length((p-source)/vec2(25,29))*2.5);
  col += vec3(0.075,0.041,0.008)*halo*lamp_amount;
  if (corridor) {
    float opening = area(p, vec2(1141,215), vec2(1295,553), 9.0);
    vec3 unlit_stairs = original.rgb*vec3(0.035,0.055,0.085);
    vec3 lit_stairs = original.rgb*vec3(0.83,1.08,1.32);
    col = mix(col, mix(unlit_stairs, lit_stairs, stair_energy), opening);
    float spill = exp(-length((p-vec2(1190,566))/vec2(128,57))*2.5);
    spill *= smoothstep(530.0,559.0,p.y);
    col *= 1.0-spill*(1.0-stair_energy)*0.60;
    col += original.rgb*vec3(0.02,0.24,0.50)*spill*stair_energy;
  } else {
    float burner = area(p, vec2(20,408), vec2(109,423), 3.0);
    float blue = smoothstep(0.006,0.04,original.b-original.r);
    col = mix(col, vec3(dot(col,vec3(0.30,0.55,0.15)))*0.40, burner*blue);
    float flame = 0.0, core = 0.0;
    if (p.x>23.0 && p.x<108.0 && p.y>405.0 && p.y<422.0) {
      for (int i=0;i<13;i++) {
        float fi = float(i);
        float base_x = 28.0+fi*6.0;
        float height = 5.0+1.8*sin(night_time*8.9+fi*2.3)+1.2*sin(night_time*15.1+fi*1.7);
        float up = (419.0-p.y)/height;
        float bend = sin(night_time*7.1+fi+up*3.0)*up*1.2;
        float width = max(0.16,1.55*(1.0-up));
        float across = (p.x-base_x-bend)/width;
        float envelope = smoothstep(-0.10,0.10,up)*(1.0-smoothstep(0.65,1.05,up));
        flame += exp(-across*across*1.8)*envelope;
        core += exp(-across*across*5.0)*envelope*(1.0-up);
      }
    }
    col += stove_amount*(vec3(0.05,0.31,0.94)*flame+vec3(0.42,0.56,0.58)*core);
    float gas_spill = exp(-length((p-vec2(65,417))/vec2(53,25))*2.8);
    col += vec3(0.004,0.023,0.058)*gas_spill*stove_amount*(0.82+0.18*sin(night_time*9.3));
    if (p.x>13.0 && p.x<119.0 && p.y>302.0 && p.y<389.0) {
      float h = (389.0-p.y)/87.0;
      float drift = sin(h*5.0-night_time*0.8)*h*11.0;
      float x = (p.x-60.0-drift)/(4.0+h*22.0);
      vec2 flow = vec2(x*1.8, h*5.2+night_time*0.72);
      float turbulence = fbm(flow+vec2(fbm(flow+vec2(8,2))*1.7,0));
      float wisps = smoothstep(0.37,0.70,turbulence);
      float density = exp(-x*x*1.5)*sin(h*3.14159)*wisps;
      float alpha = density*0.30*stove_amount*(0.30+0.70*min(lamp_amount,1.0));
      col = mix(col, vec3(0.66,0.70,0.71), alpha);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const screenVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;

export function createBackdrop() {
  const loader = new THREE.TextureLoader();
  const textures = ['apartment', 'corridor'].map((name) => {
    const t = loader.load(`./assets/${name}.png`);
    t.colorSpace = THREE.NoColorSpace; // raw sRGB bytes in, raw sRGB out
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: textures[0] },
      night_time: { value: 0 }, lamp_amount: { value: 1 }, stove_amount: { value: 1 },
      stair_energy: { value: 1 }, corridor: { value: false },
    },
    vertexShader: screenVertex, fragmentShader: fragment,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    setScene(index) {
      material.uniforms.map.value = textures[index];
      material.uniforms.corridor.value = index === 1;
    },
    update(u) { for (const k in u) material.uniforms[k].value = u[k]; },
  };
}

// Snow only inside the two room window panes, drawn behind anything nearer than the wall.
export function createSnow() {
  const count = 860;
  const seed = new Float32Array(count * 4);
  let s = 19861115;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    seed.set([rnd(), rnd(), 0.35 + rnd() * 0.65, rnd() * Math.PI * 2], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, scale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 seed; uniform float time, scale; varying float vAlpha;
      void main() {
        float pane = float(gl_VertexID >= 430);
        vec4 rect = pane > 0.5 ? vec4(710,208,95,187) : vec4(595,208,92,187);
        float x = fract(seed.x+pane*0.37+time*(0.018+seed.z*0.045)+sin(time*0.5+seed.w)*0.040);
        float y = fract(seed.y+pane*0.19+time*(0.060+seed.z*0.10));
        vec2 at = rect.xy+vec2(x,y)*rect.zw;
        vAlpha = (0.20+seed.z*0.47)*min(1.0,min(x,1.0-x)*18.0)*min(1.0,min(y,1.0-y)*18.0);
        gl_Position = vec4(at.x/640.0-1.0, 1.0-at.y/360.0, 0.9999, 1.0);
        gl_PointSize = (0.9+seed.z*1.3)*scale;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        gl_FragColor = vec4(0.75,0.85,0.94, vAlpha*smoothstep(0.5,0.15,d));
      }`,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -5;
  return { points, material };
}
