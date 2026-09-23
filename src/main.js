import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createBackdrop, createSnow } from './backdrop.js';
import { Character } from './character.js';
import { SCENES, FOV, EYE, FOCAL, roomEnergy, hallEnergy, blueEnergy } from './world.js';

const WALK = 1.35, RUN = 3.4;
const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);

// ---------- renderer & camera matched to the paintings ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
RectAreaLightUniformsLib.init();

const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 50);
camera.position.set(0, EYE, 0);
camera.lookAt(0, EYE, -1);

const scene = new THREE.Scene();
const backdrop = createBackdrop();
scene.add(backdrop.mesh);
const snow = createSnow();
scene.add(snow.points);

// Invisible surfaces of the painted room that only receive the character's shadows.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.62, color: 0x0a0604 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), new THREE.ShadowMaterial({ opacity: 0.45, color: 0x0a0604 }));
backWall.position.y = 3;
backWall.receiveShadow = true;
scene.add(backWall);

// Soft contact shadow: the thing that makes feet actually touch the painted floor.
const contact = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.78)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.scale.set(0.95, 0.62, 1);
  scene.add(m);
  return m;
})();

// ---------- lights that match what is painted ----------
const hemi = new THREE.HemisphereLight(0x3a3f4a, 0x1c130c, 0.55);
scene.add(hemi);

const warm = new THREE.PointLight(0xffa04a, 0, 9, 2);
warm.castShadow = true;
warm.shadow.mapSize.set(1024, 1024);
warm.shadow.bias = -0.002;
warm.shadow.radius = 6;
scene.add(warm);

const stoveLight = new THREE.PointLight(0x3d7bff, 0, 3.2, 2);
scene.add(stoveLight);

const windowLight = new THREE.RectAreaLight(0x7fa2d6, 0, 1, 1);
windowLight.lookAt(0, 0, 1);
scene.add(windowLight);

const neon = new THREE.PointLight(0x4a8cff, 0, 6, 2);
scene.add(neon);

// Light bounced off the lit walls back toward the viewer; the painting shows it on every surface,
// so the side of the body facing the camera must receive it too.
const bounce = new THREE.DirectionalLight(0xffbf85, 0);
bounce.position.set(0.4, EYE + 0.6, 0);
scene.add(bounce, bounce.target);

// ---------- game state ----------
const game = {
  index: 0, time: 0, lampOn: true, stoveOn: true, radioOn: false, snowOn: true, faulty: true, quiet: true,
  light: 1, gas: 1, stair: 1, busy: null, fading: false, station: -1,
};
const keys = new Set();
const velocity = new THREE.Vector3();
let player, near = null, hovered = null, lineTimer = 0, stepDistance = 0;
// Click-to-move: walk to `pos`, then interact with `thing` if there is one.
let goal = null;

// ---------- sound ----------
const sound = (name, volume = 0.5) => {
  const a = new Audio(`./assets/audio/${name.includes('.') ? name : name + '.wav'}`);
  a.volume = volume;
  return a;
};
const wind = sound('wind', 0.35); wind.loop = true;
let radio = null;
// Each use of the radio turns the dial to the next station; after the last one it switches off.
const STATIONS = [
  { file: 'radio_trei_culori', name: 'Programul 1 — „Trei culori”' },
  { file: 'radio_te_slavim', name: 'Programul 1 — „Te slăvim, Românie”' },
  { file: 'radio_zdrobite_catuse', name: 'Programul 1 — „Zdrobite cătușe”' },
  { file: 'radio_e_scris_pe_tricolor', name: 'Programul 1 — „E scris pe tricolor Unire”' },
  { file: 'radio_europa_libera', name: 'Unde scurte — Radio Europa Liberă, bruiat' },
];
function tuneRadio() {
  radio?.pause();
  radio = null;
  game.station = (game.station + 1) % (STATIONS.length + 1);
  game.radioOn = game.station < STATIONS.length;
  play('latch', 0.25);
  if (!game.radioOn) return;
  const station = STATIONS[game.station];
  const sweep = sound('radio_tuning.mp3', 0.5);
  sweep.play().catch(() => {});
  const next = sound(station.file + '.mp3', 0.55);
  next.loop = true;
  radio = next;
  setTimeout(() => { if (radio === next) next.play().catch(() => {}); }, 1050);
  say(station.name, 2.8);
}
function play(name, volume) { if (!game.quiet || name !== 'wind') sound(name, volume).play().catch(() => {}); }

// ---------- scene switching ----------
function setScene(index, from) {
  game.index = index;
  const s = SCENES[index];
  backdrop.setScene(index);
  snow.points.visible = index === 0;
  backWall.position.z = -s.wall;
  $('chapter').innerHTML = s.chapter;
  game.lampOn = true;
  game.light = 1;
  if (index === 0) {
    warm.position.copy(s.lights.lamp);
    stoveLight.position.copy(s.lights.stove);
  } else {
    warm.position.copy(s.lights.bulb);
    neon.position.copy(s.lights.neon);
  }
  const win = s.lights.window;
  windowLight.position.copy(win.center);
  windowLight.width = win.width;
  windowLight.height = win.height;
  windowLight.lookAt(win.center.x, win.center.y, 0);
  stoveLight.visible = index === 0;
  neon.visible = index === 1;
  goal = null;
  if (player) {
    player.position.copy(from === undefined ? s.spawn.at : s.arrive);
    player.root.rotation.y = from === undefined ? -Math.PI / 2 : 0; // profile, facing into the room
    velocity.set(0, 0, 0);
  }
  if (radio && index !== 0) { radio.pause(); radio = null; game.radioOn = false; game.station = -1; }
}

function changeScene(index) {
  if (game.fading) return;
  game.fading = true;
  $('fade').style.opacity = 1;
  play('latch', 0.5);
  setTimeout(() => {
    setScene(index, game.index);
    $('fade').style.opacity = 0;
    setTimeout(() => (game.fading = false), 350);
  }, 380);
}

function say(text, seconds = 3.6) {
  $('line').textContent = text;
  $('line').style.opacity = 1;
  lineTimer = seconds;
}

// ---------- interactions ----------
function act(thing) {
  switch (thing.id) {
    case 'lamp': game.lampOn = !game.lampOn; play('latch', 0.25); break;
    case 'stove': game.stoveOn = !game.stoveOn; play('latch', 0.35); break;
    case 'radio': tuneRadio(); break;
  }
  if (thing.knock) play('knock', 0.7);
  if (thing.line) say(thing.line);
  if (thing.exit !== undefined) changeScene(thing.exit);
}

// A short scripted beat: turn to the object, reach (or look), trigger at the peak, relax.
function interact(thing) {
  const target = thing.reach ?? thing.look;
  game.busy = { thing, t: 0, target, yaw: Math.atan2(target.x - player.position.x, target.z - player.position.z), fired: false };
}

function updateBusy(dt) {
  const b = game.busy;
  b.t += dt;
  const turn = Math.atan2(Math.sin(b.yaw - player.root.rotation.y), Math.cos(b.yaw - player.root.rotation.y));
  player.root.rotation.y += turn * Math.min(1, dt * 9);
  player.lookTarget = b.target;
  if (b.thing.reach) {
    player.reachTarget = b.thing.reach;
    // ease in 0.15–0.6 s, hold to 0.85 s, ease out by 1.35 s
    const t = b.t;
    const w = t < 0.15 ? 0 : t < 0.6 ? THREE.MathUtils.smootherstep(t, 0.15, 0.6) : t < 0.85 ? 1 : 1 - THREE.MathUtils.smootherstep(t, 0.85, 1.35);
    player.reachWeight = w;
    if (!b.fired && t > 0.62) { b.fired = true; act(b.thing); }
    if (t > 1.4) { game.busy = null; player.reachWeight = 0; }
  } else {
    if (!b.fired && b.t > 0.45) { b.fired = true; act(b.thing); }
    if (b.t > 1.1) game.busy = null;
  }
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (wind.paused && !game.quiet) wind.play().catch(() => {});
  switch (e.code) {
    case 'KeyE': case 'Enter': if (near && !game.busy && !game.fading) interact(near); break;
    case 'KeyM': game.quiet = !game.quiet; game.quiet ? wind.pause() : wind.play().catch(() => {}); break;
    case 'KeyL': game.lampOn = !game.lampOn; break;
    case 'KeyF': game.stoveOn = !game.stoveOn; break;
    case 'KeyN': game.snowOn = !game.snowOn; break;
    case 'KeyB': game.faulty = !game.faulty; break;
    case 'KeyH': stage.classList.toggle('hidden'); break;
    case 'Digit1': changeScene(0); break;
    case 'Digit2': changeScene(1); break;
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- mouse: click an object to walk there and use it, click the floor to walk ----------
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width * 1280, v = (e.clientY - r.top) / r.height * 720;
  const s = SCENES[game.index];
  const thing = s.things.find((t) => u >= t.hit[0] && u <= t.hit[2] && v >= t.hit[1] && v <= t.hit[3]);
  if (thing) return { thing, pos: thing.stand.clone() };
  // Anywhere else: walk to the point on his lane under the cursor.
  const pos = new THREE.Vector3((u - 640) * -s.lane / FOCAL, 0, s.lane);
  s.walkable(pos);
  return { pos };
}
renderer.domElement.addEventListener('mousemove', (e) => {
  hovered = pick(e)?.thing ?? null;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';
});
renderer.domElement.addEventListener('mouseleave', () => (hovered = null));
renderer.domElement.addEventListener('click', (e) => {
  if (!player || game.busy || game.fading) return;
  const target = pick(e);
  if (!target) return;
  goal = { ...target, run: e.detail >= 2, stuck: 0 }; // double click hurries
  if (wind.paused && !game.quiet) wind.play().catch(() => {});
});
addEventListener('blur', () => keys.clear());

// ---------- layout: keep the painting at 16:9, letterboxed ----------
function resize() {
  const w = Math.min(innerWidth, innerHeight * 16 / 9), h = w * 9 / 16;
  renderer.setSize(w, h);
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  snow.material.uniforms.scale.value = (h / 720) * renderer.getPixelRatio();
}
addEventListener('resize', resize);
resize();

// ---------- frame ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  game.time += dt;
  const s = SCENES[game.index];

  // lights, exactly as the Godot study drives them
  game.light = THREE.MathUtils.clamp(game.light + Math.sign((game.lampOn ? 1 : 0) - game.light) * dt * 2.2, 0, 1);
  game.gas = THREE.MathUtils.clamp(game.gas + Math.sign((game.stoveOn ? 1 : 0) - game.gas) * dt * 3.0, 0, 1);
  const blueTarget = game.faulty ? blueEnergy(game.time) : 1;
  game.stair += THREE.MathUtils.clamp(blueTarget - game.stair, -dt * 22, dt * 22);
  const energy = game.light * (game.index === 0 ? roomEnergy(game.time) : hallEnergy(game.time));
  backdrop.update({ night_time: game.time, lamp_amount: energy, stove_amount: game.gas, stair_energy: game.stair });
  snow.material.uniforms.time.value = game.time;
  snow.points.visible = game.index === 0 && game.snowOn;

  if (game.index === 0) {
    warm.intensity = 5.5 * energy;
    floor.material.opacity = 0.62 * Math.min(1, energy);
    stoveLight.intensity = 1.6 * game.gas * (0.85 + 0.15 * Math.sin(game.time * 9.3));
    windowLight.intensity = 1.1;
    hemi.intensity = 0.25 + 0.35 * energy;
    bounce.intensity = 0.55 * energy;
  } else {
    warm.intensity = 9 * energy;
    floor.material.opacity = 0.62 * Math.min(1, energy);
    neon.intensity = 4.5 * game.stair;
    windowLight.intensity = 2.2;
    hemi.intensity = 0.2 + 0.3 * energy;
    bounce.intensity = 0.45 * energy;
  }

  if (player) {
    // movement in screen terms: left/right across the room, up/down into its depth
    const input = new THREE.Vector3(
      (keys.has('KeyD') || keys.has('ArrowRight')) - (keys.has('KeyA') || keys.has('ArrowLeft')), 0, 0);
    if (input.lengthSq() > 0) goal = null; // keyboard takes over
    if (game.busy || game.fading) input.set(0, 0, 0);
    if (input.lengthSq() > 0) input.normalize().multiplyScalar(keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK);
    else if (goal && !game.busy && !game.fading) {
      const to = goal.pos.clone().sub(player.position).setY(0);
      const dist = to.length();
      if (dist < 0.06 || goal.stuck > 0.35) {
        const thing = goal.thing;
        goal = null;
        if (thing) interact(thing);
      } else input.copy(to).normalize().multiplyScalar(Math.min(goal.run ? RUN : WALK, 0.4 + dist * 2.5));
    }
    velocity.lerp(input, 1 - Math.exp(-dt * (input.lengthSq() > 0 ? 7 : 10)));
    const before = player.position.clone();
    player.position.addScaledVector(velocity, dt);
    s.walkable(player.position);
    const moved = player.position.distanceTo(before);
    const speed = moved / dt;
    if (goal) goal.stuck = input.lengthSq() > 0.01 && speed < 0.05 ? goal.stuck + dt : 0; // blocked by the room edge
    if (speed > 0.2) {
      const yaw = Math.atan2(velocity.x, velocity.z);
      const d = Math.atan2(Math.sin(yaw - player.root.rotation.y), Math.cos(yaw - player.root.rotation.y));
      player.root.rotation.y += d * Math.min(1, dt * 10);
      stepDistance += moved;
      if (stepDistance > (speed > 2 ? 1.05 : 0.72)) { stepDistance = 0; if (!game.quiet) play('step', speed > 2 ? 0.28 : 0.16); }
    }

    // nearest thing within reach
    near = null;
    let best = 0.75;
    for (const t of s.things) {
      const d = Math.hypot(t.stand.x - player.position.x, (t.stand.z - player.position.z) * 1.4);
      if (d < best) { best = d; near = t; }
    }
    if (game.busy) updateBusy(dt);
    else {
      player.reachWeight = 0;
      player.lookTarget = near ? (near.reach ?? near.look) : null;
    }
    player.animate(dt, speed, { walkSpeed: WALK, runSpeed: RUN });

    contact.position.set(player.position.x, 0.004, player.position.z);
    bounce.target.position.copy(player.position);
    const shown = game.busy ? null : hovered ?? goal?.thing ?? near;
    if (shown) $('prompt').innerHTML = shown === near && shown !== hovered ? `<b>E</b>${shown.label(game)}` : shown.label(game);
    $('prompt').style.opacity = shown ? 1 : 0;
  }
  if (lineTimer > 0 && (lineTimer -= dt) <= 0) $('line').style.opacity = 0;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

setScene(0);
Character.load('./assets/readyplayer.glb', {
  idle: ['./assets/Soldier.glb', 'Idle'], walk: ['./assets/Soldier.glb', 'Walk'], run: ['./assets/Soldier.glb', 'Run'],
}).then((c) => {
  player = c;
  scene.add(player.root);
  setScene(0);
  window.__game = { game, player, camera, scene, keys, velocity, pick, getGoal: () => goal }; // for inspection
  $('fade').style.opacity = 0;
});
requestAnimationFrame(frame);
