import * as THREE from 'three';

// Both paintings are frontal one-point perspectives rendered at 1280x720 reference pixels.
// Measured from the pictures: 2 m doors span ~322 px on the back wall and the wall base sits
// at y≈542, which fits one camera: eye height 1.15 m, focal 772 px, horizon at y=360.
export const FOCAL = 772;
export const EYE = 1.15;
export const FOV = THREE.MathUtils.radToDeg(2 * Math.atan(360 / FOCAL));

// Picture pixel + depth (metres, positive) -> world point.
export function fromPicture(u, v, depth) {
  return new THREE.Vector3((u - 640) * depth / FOCAL, EYE - (v - 360) * depth / FOCAL, -depth);
}
// `hit` rectangles below are clickable areas in picture pixels [x0, y0, x1, y1].

const lamp = fromPicture(381, 382, 4.62);

export const SCENES = [
  {
    name: 'room',
    chapter: 'BUCUREȘTI, IARNA 1986 &nbsp; · &nbsp; APARTAMENTUL 7',
    wall: 4.85,
    spawn: { at: new THREE.Vector3(0.6, 0, 0) },
    arrive: new THREE.Vector3(2.35, 0, -3.8),
    lane: -3.9, // he walks one line across the room, just in front of the stove and table
    minX: -2.6, maxX: 2.75,
    lights: {
      lamp,
      stove: fromPicture(62, 418, 4.1),
      window: { center: fromPicture(701, 302, 4.84), width: 1.33, height: 1.22 },
    },
    things: [
      { id: 'lamp', hit: [362, 330, 402, 432], stand: new THREE.Vector3(-2.05, 0, -4.1), reach: lamp.clone().add(new THREE.Vector3(0.05, -0.12, 0.08)),
        label: (g) => (g.lampOn ? 'Stinge lampa' : 'Aprinde lampa') },
      { id: 'radio', hit: [416, 368, 504, 428], stand: new THREE.Vector3(-0.55, 0, -4.15), reach: fromPicture(470, 400, 4.55),
        label: (g) => (!g.radioOn ? 'Pornește radioul' : g.station === 4 ? 'Oprește radioul' : 'Schimbă postul') },
      { id: 'stove', hit: [8, 392, 144, 578], stand: new THREE.Vector3(-2.25, 0, -3.72), reach: fromPicture(80, 440, 4.02),
        label: (g) => (g.stoveOn ? 'Stinge aragazul' : 'Aprinde aragazul') },
      { id: 'window', hit: [588, 192, 818, 412], stand: new THREE.Vector3(0.45, 0, -4.2), look: fromPicture(700, 300, 4.84),
        label: () => 'Privește afară', line: 'Ninge peste blocuri. Nicio lumină la vecinii de vizavi.' },
      { id: 'door', hit: [1182, 176, 1262, 592], stand: new THREE.Vector3(2.55, 0, -3.85), look: fromPicture(1230, 380, 4.0),
        label: () => 'Ieși pe hol', exit: 1 },
    ],
  },
  {
    name: 'hall',
    chapter: 'BUCUREȘTI, IARNA 1986 &nbsp; · &nbsp; ETAJUL TREI',
    wall: 4.8,
    arrive: new THREE.Vector3(-0.17, 0, -3.95),
    lane: -4.1,
    minX: -3.55, maxX: 3.6,
    lights: {
      bulb: fromPicture(606, 136, 4.55),
      window: { center: fromPicture(95, 266, 4.78), width: 0.36, height: 1.72 },
      neon: fromPicture(1215, 330, 5.3),
    },
    things: [
      { id: 'home', hit: [548, 214, 677, 546], stand: new THREE.Vector3(-0.17, 0, -4.2), reach: fromPicture(652, 380, 4.8),
        label: () => 'Intră în apartament', exit: 0 },
      { id: 'left-door', hit: [173, 214, 270, 546], stand: new THREE.Vector3(-2.5, 0, -4.2), reach: fromPicture(240, 350, 4.8),
        label: () => 'Bate la vecini', knock: true, line: 'Nu răspunde nimeni. Dar cineva stinge lumina înăuntru.' },
      { id: 'right-door', hit: [938, 214, 1067, 546], stand: new THREE.Vector3(2.25, 0, -4.2), reach: fromPicture(1000, 350, 4.8),
        label: () => 'Bate la vecini', knock: true, line: 'Pași, apoi liniște. Nu deschide nimeni.' },
      { id: 'stairs', hit: [1143, 208, 1278, 548], stand: new THREE.Vector3(3.3, 0, -4.2), look: fromPicture(1205, 420, 5.2),
        label: () => 'Ascultă pe scară', line: 'Scara spre subsol. Neonul se tot stinge.' },
      { id: 'crates', hit: [272, 238, 480, 562], stand: new THREE.Vector3(-1.4, 0, -4.2), look: fromPicture(415, 420, 4.6),
        label: () => 'Uită-te în lăzi', line: 'Cartofi și cărbuni pentru iarnă. Destul pentru o săptămână.' },
      { id: 'hall-window', hit: [58, 118, 127, 410], stand: new THREE.Vector3(-3.3, 0, -4.25), look: fromPicture(95, 260, 4.78),
        label: () => 'Privește afară', line: 'Geamul e înghețat pe dinăuntru.' },
    ],
  },
];

// Movement is side-on only: every position lives on the scene's lane.
for (const s of SCENES) {
  s.walkable = (p) => { p.x = THREE.MathUtils.clamp(p.x, s.minX, s.maxX); p.y = 0; p.z = s.lane; };
  for (const t of s.things) s.walkable(t.stand);
  if (s.spawn) s.walkable(s.spawn.at);
  s.walkable(s.arrive);
}

// Light curves ported from scripts/atmosphere.gd.
export function roomEnergy(t) {
  const m = ((t % 9.7) + 9.7) % 9.7;
  const dip = Math.exp(-(((m - 5.1) / 0.40) ** 2)) * 0.19;
  return THREE.MathUtils.clamp(0.86 + Math.sin(t * 3.7) * 0.10 + Math.sin(t * 9.1 + 0.5) * 0.065 + Math.sin(t * 17.7 + 2.0) * 0.035 - dip, 0.48, 1.09);
}
export function hallEnergy(t) {
  const phase = t % 12.7;
  return 1.0 + Math.sin(t * 2.1) * 0.002 - Math.exp(-(((phase - 8.2) / 0.11) ** 2)) * 0.22 - Math.exp(-(((phase - 8.52) / 0.075) ** 2)) * 0.11;
}
export function blueEnergy(t) {
  const phase = t % 9.6;
  if (phase < 1.9) return 1.0;
  if (phase < 2.6) return 0.025;
  if (phase < 2.82) return 0.72;
  if (phase < 3.05) return 0.04;
  if (phase < 5.15) return 1.0;
  if (phase < 6.45) return 0.015;
  if (phase < 6.82) return 0.68;
  if (phase < 7.45) return 0.04;
  return 1.0;
}
