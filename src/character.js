import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();

// Rotate `bone` in world space by `delta`, blended by `weight`.
function rotateWorld(bone, delta, weight) {
  bone.getWorldQuaternion(_q2);
  _q.copy(delta).multiply(_q2);                    // desired world rotation
  bone.parent.getWorldQuaternion(_pq).invert();
  _q.premultiply(_pq);                             // back to parent space
  bone.quaternion.slerp(_q, weight);
  bone.updateMatrixWorld(true);
}

// The stock outfit is a pink suit; wear it down to the drab wool of a 1980s bloc.
function wearClothes(material) {
  const image = material.map?.image;
  if (!image) return;
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const g = canvas.getContext('2d');
  g.filter = /Bottom/.test(material.name) ? 'saturate(0.15) brightness(0.42)' : 'saturate(0.25) brightness(0.55) sepia(0.25)';
  g.drawImage(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = material.map.flipY;
  map.channel = material.map.channel;
  material.map = map;
  material.roughness = 0.95;
  material.metalness = 0;
}

const NATIVE_WALK = 1.66, NATIVE_RUN = 4.35; // m/s of the Mixamo walk and run clips

export class Character {
  // The body comes from `modelUrl`; motion‑captured Mixamo clips are retargeted onto its skeleton.
  // `motions` maps a clip name wanted by the game to [url, clip name in that file].
  static async load(modelUrl, motions) {
    const loader = new GLTFLoader();
    const urls = [...new Set(Object.values(motions).map(([url]) => url))];
    const [model, ...files] = await Promise.all([modelUrl, ...urls].map((u) => loader.loadAsync(u)));
    let target;
    model.scene.traverse((o) => { if (o.isSkinnedMesh && !target) target = o; });
    // Hip translation is copied in world units; scale it by rest hip height or the feet float.
    const hipHeight = (root, name) => { root.updateMatrixWorld(true); return root.getObjectByName(name).getWorldPosition(new THREE.Vector3()).y; };
    const targetHip = hipHeight(model.scene, 'Hips');
    const sourceHips = files.map((f) => hipHeight(f.scene, 'mixamorigHips'));
    const clips = Object.entries(motions).map(([name, [url, clipName]]) => {
      const motion = files[urls.indexOf(url)];
      let source;
      motion.scene.traverse((o) => { if (o.isSkinnedMesh && !source) source = o; });
      motion.scene.updateMatrixWorld(true);
      const clip = motion.animations.find((c) => c.name === clipName);
      const out = SkeletonUtils.retargetClip(target, source, clip, {
        hip: 'mixamorigHips',
        scale: targetHip / sourceHips[urls.indexOf(url)],
        getBoneName: (bone) => 'mixamorig' + bone.name,
      });
      out.name = name;
      // retargetClip binds through `.bones[Name]`; bind by node name so every mesh follows.
      for (const track of out.tracks) track.name = track.name.replace(/^\.bones\[(.+?)\]/, '$1');
      return out;
    });
    target.skeleton.pose();
    return new Character(model.scene, clips);
  }

  constructor(model, clips) {
    // The Mixamo source faces -Z, so retargeted hips turn the body around; undo that once here
    // so the game can treat rotation.y = 0 as "facing the camera".
    model.rotation.y = Math.PI;
    this.root = new THREE.Group();
    this.root.add(model);
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.material.envMapIntensity = 0;
        if (/Outfit|Headwear/.test(o.material.name)) wearClothes(o.material);
      }
    });
    this.bones = {};
    this.root.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const name of ['idle', 'walk', 'run']) {
      this.actions[name].play();
      this.actions[name].setEffectiveWeight(name === 'idle' ? 1 : 0);
    }

    // The soles: the lowest vertices of the shoes in rest pose. Each frame they are skinned on the
    // CPU and the body is set so the lowest one rests exactly on the floor.
    this.model = model;
    model.traverse((o) => { if (o.isSkinnedMesh && /Footwear/.test(o.name)) this.shoes = o; });
    this.shoes.skeleton.pose();
    this.root.updateMatrixWorld(true);
    const pos = this.shoes.geometry.attributes.position;
    const byHeight = [...Array(pos.count).keys()].sort((i, j) => pos.getY(i) - pos.getY(j));
    this.sole = byHeight.slice(0, Math.min(400, byHeight.length));
    this.ground = 0;

    this.reachTarget = null;
    this.reachWeight = 0;
    this.lookTarget = null;
    this.lookWeight = 0;
  }

  get position() { return this.root.position; }

  // speed in m/s drives the idle/walk/run blend; playback rate follows ground speed so the
  // planted foot moves exactly with the floor (native speeds measured from the clips' stance phase).
  animate(dt, speed, { walkSpeed, runSpeed }) {
    const w = this.actions.walk, r = this.actions.run, i = this.actions.idle;
    const runW = THREE.MathUtils.smoothstep(speed, walkSpeed * 1.1, runSpeed * 0.9);
    const walkW = THREE.MathUtils.clamp(speed / (walkSpeed * 0.5), 0, 1) * (1 - runW);
    i.setEffectiveWeight(1 - walkW - runW);
    w.setEffectiveWeight(walkW);
    r.setEffectiveWeight(runW);
    w.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / NATIVE_WALK, 0.6, 1.5));
    r.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / NATIVE_RUN, 0.65, 1.2));
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    this.#plantFeet(dt, 1 - runW);
    this.#look(dt);
    this.#reach(dt);
  }

  // Move the body so the lowest sole vertex touches the floor. While walking or standing one foot
  // is always planted; running has flight phases, so there the soles are only kept out of the floor.
  #plantFeet(dt, weight) {
    let lowest = Infinity;
    for (const i of this.sole) {
      this.shoes.getVertexPosition(i, _a);
      lowest = Math.min(lowest, _a.applyMatrix4(this.shoes.matrixWorld).y);
    }
    lowest -= this.root.position.y + this.model.position.y;
    const target = THREE.MathUtils.lerp(Math.max(0, -lowest), -lowest, weight);
    this.ground = THREE.MathUtils.damp(this.ground, target, 45, dt);
    this.model.position.y = this.ground;
    this.root.updateMatrixWorld(true);
  }

  #look(dt) {
    this.lookWeight = THREE.MathUtils.damp(this.lookWeight, this.lookTarget ? 1 : 0, 4, dt);
    if (this.lookWeight < 0.01 || !this.lookTarget) return;
    const head = this.bones.Head, neck = this.bones.Neck;
    head.getWorldPosition(_a);
    _b.copy(this.lookTarget).sub(_a).normalize();
    _c.set(0, 0, 1).applyQuaternion(this.root.quaternion);          // body forward
    const bodyYaw = Math.atan2(_c.x, _c.z);
    // Keep the turn human: at most ~70° of yaw and a little pitch, shared by neck and head.
    const yaw = Math.atan2(_b.x, _b.z) - bodyYaw;
    const clampedYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -1.2, 1.2);
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(_b.y, -1, 1)), -0.45, 0.35);
    const rest = new THREE.Vector3(Math.sin(bodyYaw), -0.05, Math.cos(bodyYaw)).normalize();
    const want = new THREE.Vector3(Math.sin(bodyYaw + clampedYaw) * Math.cos(pitch), Math.sin(pitch),
      Math.cos(bodyYaw + clampedYaw) * Math.cos(pitch));
    const delta = new THREE.Quaternion().setFromUnitVectors(rest, want);
    const w = this.lookWeight * 0.5;
    rotateWorld(neck, delta, w);
    rotateWorld(head, delta, w * 0.9);
  }

  // Two-bone IK on the right arm toward reachTarget, blended over the animated pose.
  #reach(dt) {
    if (!this.reachTarget || this.reachWeight < 0.001) return;
    const upper = this.bones.RightArm, lower = this.bones.RightForeArm, hand = this.bones.RightHand;
    const S = upper.getWorldPosition(new THREE.Vector3());
    const E = lower.getWorldPosition(new THREE.Vector3());
    const H = hand.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E), b = E.distanceTo(H);
    const T = this.reachTarget;
    const toT = _a.copy(T).sub(S);
    const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const dir = toT.normalize();
    // Elbow bends outward and down, like a real arm reaching forward.
    const side = _d.set(-1, 0, 0).applyQuaternion(this.root.quaternion);
    const pole = _b.copy(side).multiplyScalar(0.6).add(new THREE.Vector3(0, -1, 0));
    pole.sub(_c.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pole, a * sinA);
    const w = this.reachWeight;
    rotateWorld(upper, _q.setFromUnitVectors(E.clone().sub(S).normalize(), elbow.clone().sub(S).normalize()), w);
    const E2 = lower.getWorldPosition(new THREE.Vector3());
    const H2 = hand.getWorldPosition(new THREE.Vector3());
    const handTarget = S.clone().addScaledVector(dir, d);
    rotateWorld(lower, _q.setFromUnitVectors(H2.sub(E2).normalize(), handTarget.sub(E2).normalize()), w);
  }
}
