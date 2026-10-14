import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Constants & Grid Mapping ---
const LANE_WIDTH = 0.8;
const LAYER_HEIGHT = 0.6;
const BASE_Y = 0.5; // Bottom layer center y
const DEFAULT_NJS = 14.0; // Note Jump Speed (units/second or beat scaled)
const VISIBLE_DISTANCE = 50.0; // Z distance where notes spawn

// Cut direction angles in radians (pointing towards player on -Z face)
// 0: Up, 1: Down, 2: Left, 3: Right, 4: Up-Left, 5: Up-Right, 6: Down-Left, 7: Down-Right, 8: Any/Dot
const DIR_ANGLES = {
  0: Math.PI,         // Up
  1: 0,               // Down
  2: -Math.PI / 2,    // Left
  3: Math.PI / 2,     // Right
  4: (3 * Math.PI) / 4, // Up-Left
  5: -(3 * Math.PI) / 4,// Up-Right
  6: Math.PI / 4,       // Down-Left
  7: -Math.PI / 4       // Down-Right
};

const DIR_SYMBOLS = ['↑', '↓', '←', '→', '↖', '↗', '↙', '↘', '•'];

export class BeatSaberViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.audio = document.getElementById('bgm-audio');
    
    this.bpm = 128.0;
    this.njs = DEFAULT_NJS;
    this.timeOffset = 0.0;
    this.notes = [];
    this.noteMeshes = [];
    this.activeMeshPool = [];
    
    this.isPlaying = false;
    this.currentBeat = 0.0;
    this.currentTime = 0.0;
    this.cameraMode = 'third'; // 'third', 'first', 'free'
    
    // Parity state telemetry
    this.parityState = {
      left: { x: '-', y: '-', dir: '-' },
      right: { x: '-', y: '-', dir: '-' },
      lastCutBeat: 0
    };

    this.initThree();
    this.initMaterialsAndTextures();
    this.buildTrackEnvironment();
    this.setupEventListeners();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0b10, 0.025);

    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 300);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0b10, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1.2, 12);
    this.controls.enabled = false;

    this.setCameraMode('third');

    // Ambient and Point lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(0, 10, -5);
    this.scene.add(dirLight);
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    document.querySelectorAll('.btn-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'third') {
      this.controls.enabled = false;
      this.camera.position.set(0, 2.1, -2.8);
      this.camera.lookAt(0, 1.1, 10);
    } else if (mode === 'first') {
      this.controls.enabled = false;
      this.camera.position.set(0, 1.55, -0.1);
      this.camera.lookAt(0, 1.2, 15);
    } else if (mode === 'free') {
      this.controls.enabled = true;
    }
  }

  initMaterialsAndTextures() {
    // Generate Arrow & Dot textures using Canvas for both red (0) and blue (1) hands
    this.arrowTextures = { red: {}, blue: {} };
    for (let dir = 0; dir <= 8; dir++) {
      this.arrowTextures.red[dir] = this.createDirectionTexture(dir, true);
      this.arrowTextures.blue[dir] = this.createDirectionTexture(dir, false);
    }

    // Geometries
    this.cubeGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);

    // Color definitions
    this.COLOR_RED = 0xf43f5e;
    this.COLOR_BLUE = 0x0ea5e9;
    this.COLOR_BOMB = 0x334155;

    // Materials
    this.matRedBase = new THREE.MeshStandardMaterial({
      color: this.COLOR_RED,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0x881337,
      emissiveIntensity: 0.4
    });

    this.matBlueBase = new THREE.MeshStandardMaterial({
      color: this.COLOR_BLUE,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4
    });
  }

  createDirectionTexture(dir, isRed) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const primaryColor = isRed ? '#f43f5e' : '#0ea5e9';
    const darkEmissive = isRed ? '#881337' : '#0369a1';

    // 1. Solid base face background
    ctx.fillStyle = primaryColor;
    ctx.fillRect(0, 0, 128, 128);

    // 2. High-contrast inner border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 120, 120);

    // 3. Arrow / Dot symbol
    ctx.save();
    ctx.translate(64, 64);

    if (dir === 8) {
      // Dot
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const angle = DIR_ANGLES[dir] ?? 0;
      ctx.rotate(angle);

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;

      // Triangle arrow pointing Down when angle = 0
      ctx.beginPath();
      ctx.moveTo(0, 34);      // bottom tip
      ctx.lineTo(30, -16);   // top right wing
      ctx.lineTo(12, -10);   // inner notch right
      ctx.lineTo(12, -34);   // top stem right
      ctx.lineTo(-12, -34);  // top stem left
      ctx.lineTo(-12, -10);  // inner notch left
      ctx.lineTo(-30, -16);  // top left wing
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  buildTrackEnvironment() {
    // 1. Neon runway track plane
    const trackWidth = 4 * LANE_WIDTH + 0.6;
    const trackLength = 120;
    const trackGeo = new THREE.PlaneGeometry(trackWidth, trackLength, 4, 60);
    const trackMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(0, 0, trackLength / 2 - 5);
    this.scene.add(trackMesh);

    // 2. Track rails / borders
    const railMatLeft = new THREE.LineBasicMaterial({ color: this.COLOR_RED, linewidth: 2 });
    const railMatRight = new THREE.LineBasicMaterial({ color: this.COLOR_BLUE, linewidth: 2 });

    const railGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.02, -5),
      new THREE.Vector3(0, 0.02, 100)
    ]);

    const leftRail = new THREE.Line(railGeo, railMatLeft);
    leftRail.position.x = -trackWidth / 2;
    this.scene.add(leftRail);

    const rightRail = new THREE.Line(railGeo, railMatRight);
    rightRail.position.x = trackWidth / 2;
    this.scene.add(rightRail);

    // 3. Hit Line / Cut Plane at Z = 0
    const hitLineGeo = new THREE.PlaneGeometry(trackWidth + 0.4, 0.1);
    const hitLineMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    this.hitLine = new THREE.Mesh(hitLineGeo, hitLineMat);
    this.hitLine.rotation.x = -Math.PI / 2;
    this.hitLine.position.set(0, 0.03, 0);
    this.scene.add(this.hitLine);

    // 4. Side Neon Light Pillars
    const pillarGeo = new THREE.CylinderGeometry(0.04, 0.04, 3, 8);
    for (let z = 0; z < 80; z += 6) {
      // Left pillar (red)
      const pLeftMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const pLeft = new THREE.Mesh(pillarGeo, pLeftMat);
      pLeft.position.set(-trackWidth / 2 - 0.3, 1.5, z);
      this.scene.add(pLeft);

      // Right pillar (blue)
      const pRightMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
      const pRight = new THREE.Mesh(pillarGeo, pRightMat);
      pRight.position.set(trackWidth / 2 + 0.3, 1.5, z);
      this.scene.add(pRight);
    }

    // 5. Player Footsteps Platform
    const platGeo = new THREE.BoxGeometry(1.6, 0.05, 1.6);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2
    });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(0, 0.02, -1.2);
    this.scene.add(platform);

    // 6. Realistic VR Sabers (Red Left & Blue Right)
    this.initSabers();
  }

  initSabers() {
    this.saberLeft = this.createSaberMesh(this.COLOR_RED, true);
    this.saberRight = this.createSaberMesh(this.COLOR_BLUE, false);

    // Initial resting positions at player waist
    this.saberLeft.position.set(-0.35, 1.0, -0.4);
    this.saberRight.position.set(0.35, 1.0, -0.4);

    this.scene.add(this.saberLeft);
    this.scene.add(this.saberRight);

    // Kinetic swing states
    this.saberKinematics = {
      left: { targetPos: new THREE.Vector3(-0.35, 1.0, -0.4), targetRot: new THREE.Euler(0.2, 0, 0), swingProgress: 1 },
      right: { targetPos: new THREE.Vector3(0.35, 1.0, -0.4), targetRot: new THREE.Euler(0.2, 0, 0), swingProgress: 1 }
    };
  }

  createSaberMesh(colorHex, isLeft) {
    const group = new THREE.Group();

    // Saber Hilt (Handle)
    const hiltGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.22, 16);
    const hiltMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2
    });
    const hiltMesh = new THREE.Mesh(hiltGeo, hiltMat);
    hiltMesh.position.y = -0.11;
    group.add(hiltMesh);

    // Saber Emitter Ring (Glowing band)
    const ringGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.03, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.0;
    group.add(ringMesh);

    // Saber Laser Blade (Glow core)
    const bladeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.95, 16);
    bladeGeo.translate(0, 0.475, 0); // Origin at hilt top
    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95
    });
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    group.add(bladeMesh);

    // Saber Outer Neon Aura (Thick neon sheath)
    const auraGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.97, 16);
    auraGeo.translate(0, 0.475, 0);
    const auraMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    group.add(auraMesh);

    // Initial slight natural angle
    group.rotation.x = 0.2;
    return group;
  }

  loadMapData(infoData, beatmapData) {
    this.bpm = infoData._beatsPerMinute || 128.0;
    // Beat Saber standard info.dat timeOffset is in milliseconds
    const rawOffset = infoData._songTimeOffset || 0.0;
    this.timeOffset = rawOffset > 10 ? (rawOffset / 1000.0) : rawOffset;

    const diffSet = infoData._difficultyBeatmapSets?.[0]?._difficultyBeatmaps?.[0];
    if (diffSet && diffSet._noteJumpMovementSpeed) {
      this.njs = diffSet._noteJumpMovementSpeed;
    }

    const rawNotes = beatmapData._notes || [];
    // Sort notes chronologically
    this.notes = rawNotes.slice().sort((a, b) => a._time - b._time);

    // Clear previous note meshes
    this.clearNoteMeshes();
    this.createNoteMeshes();

    // Update HUD
    const titleEl = document.querySelector('.song-title');
    const subEl = document.querySelector('.song-sub');
    const bpmEl = document.getElementById('stat-bpm');
    const countEl = document.getElementById('stat-notes');

    if (titleEl) titleEl.innerText = infoData._songName || 'Standard Track';
    if (subEl) subEl.innerText = `${infoData._songSubName || ''} • ${diffSet?._difficulty || 'Expert+'}`;
    if (bpmEl) bpmEl.innerText = this.bpm.toFixed(1);
    if (countEl) countEl.innerText = this.notes.length;

    this.showToast(`已成功载入谱面 (${this.notes.length} 个音符)`);
  }

  clearNoteMeshes() {
    for (const mesh of this.noteMeshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    }
    this.noteMeshes = [];
  }

  createNoteMeshes() {
    this.noteMeshes = this.notes.map(note => {
      const isRed = note._type === 0;
      const baseMat = isRed ? this.matRedBase : this.matBlueBase;
      const handTextures = isRed ? this.arrowTextures.red : this.arrowTextures.blue;
      const arrowTex = handTextures[note._cutDirection] || handTextures[8];

      const frontMat = new THREE.MeshBasicMaterial({
        map: arrowTex
      });

      // Cube faces: [right, left, top, bottom, front(+z), back(-z)]
      // Note travels from +Z towards -Z (player is at z <= 0).
      // The face pointing at the player (facing -Z) is index 5.
      const materials = [baseMat, baseMat, baseMat, baseMat, baseMat, frontMat];
      const mesh = new THREE.Mesh(this.cubeGeo, materials);

      // Grid mapping
      const x = (note._lineIndex - 1.5) * LANE_WIDTH;
      const y = BASE_Y + note._lineLayer * LAYER_HEIGHT;
      mesh.position.set(x, y, 1000); // Start far away
      mesh.userData = { note, initialX: x, initialY: y };

      this.scene.add(mesh);
      return mesh;
    });
  }

  updatePositions() {
    // Current beat derived from audio
    const speed = (this.njs * (this.bpm / 60.0)) * 0.45; // Beat Saber distance scaling
    
    let activeLeftNote = null;
    let activeRightNote = null;

    for (let i = 0; i < this.noteMeshes.length; i++) {
      const mesh = this.noteMeshes[i];
      const note = mesh.userData.note;
      
      const deltaBeat = note._time - this.currentBeat;
      const z = deltaBeat * speed;

      if (z > -2.0 && z < VISIBLE_DISTANCE) {
        mesh.visible = true;
        mesh.position.z = z;

        // Slice flash when hitting cut line
        if (z <= 0.3 && z >= -0.3) {
          mesh.scale.set(1.15, 1.15, 1.15);
          if (note._type === 0) activeLeftNote = note;
          if (note._type === 1) activeRightNote = note;
        } else {
          mesh.scale.set(1.0, 1.0, 1.0);
        }
      } else {
        mesh.visible = false;
        mesh.position.z = 1000;
      }
    }

    // Update Parity Telemetry if hit
    if (activeLeftNote) {
      this.parityState.left = {
        x: activeLeftNote._lineIndex,
        y: activeLeftNote._lineLayer,
        dir: DIR_SYMBOLS[activeLeftNote._cutDirection] || '?'
      };
    }
    if (activeRightNote) {
      this.parityState.right = {
        x: activeRightNote._lineIndex,
        y: activeRightNote._lineLayer,
        dir: DIR_SYMBOLS[activeRightNote._cutDirection] || '?'
      };
    }
    // Update Virtual Sabers Kinematics
    this.updateSabers(activeLeftNote, activeRightNote);

    this.updateHUDTelemetry();
  }

  updateSabers(activeLeft, activeRight) {
    if (!this.saberLeft || !this.saberRight) return;

    // Resting positions
    const restLeftPos = new THREE.Vector3(-0.35, 0.95, -0.4);
    const restRightPos = new THREE.Vector3(0.35, 0.95, -0.4);
    const restRot = new THREE.Euler(0.2, 0, 0);

    // If active note hit, calculate dynamic strike orientation based on cut direction
    // Direction angles: 0:Up, 1:Down, 2:Left, 3:Right, 4:Up-Left, 5:Up-Right, 6:Down-Left, 7:Down-Right, 8:Dot
    if (activeLeft) {
      const x = (activeLeft._lineIndex - 1.5) * LANE_WIDTH;
      const y = BASE_Y + activeLeft._lineLayer * LAYER_HEIGHT;
      this.saberKinematics.left.targetPos.set(x * 0.7 - 0.1, y, -0.05);

      const rot = this.calculateSaberSwingAngle(activeLeft._cutDirection, true);
      this.saberKinematics.left.targetRot.copy(rot);
      this.saberKinematics.left.swingProgress = 0;
    }

    if (activeRight) {
      const x = (activeRight._lineIndex - 1.5) * LANE_WIDTH;
      const y = BASE_Y + activeRight._lineLayer * LAYER_HEIGHT;
      this.saberKinematics.right.targetPos.set(x * 0.7 + 0.1, y, -0.05);

      const rot = this.calculateSaberSwingAngle(activeRight._cutDirection, false);
      this.saberKinematics.right.targetRot.copy(rot);
      this.saberKinematics.right.swingProgress = 0;
    }

    // Smooth lerp for Left Saber
    const kl = this.saberKinematics.left;
    const kr = this.saberKinematics.right;

    kl.swingProgress = Math.min(1.0, kl.swingProgress + 0.08);
    kr.swingProgress = Math.min(1.0, kr.swingProgress + 0.08);

    // Slerp / Lerp towards target when striking, smoothly ease back to rest position
    const currentLeftGoal = kl.swingProgress < 0.6 ? kl.targetPos : restLeftPos;
    const currentLeftRot = kl.swingProgress < 0.6 ? kl.targetRot : restRot;
    const currentRightGoal = kr.swingProgress < 0.6 ? kr.targetPos : restRightPos;
    const currentRightRot = kr.swingProgress < 0.6 ? kr.targetRot : restRot;

    this.saberLeft.position.lerp(currentLeftGoal, 0.25);
    this.saberLeft.rotation.x = THREE.MathUtils.lerp(this.saberLeft.rotation.x, currentLeftRot.x, 0.25);
    this.saberLeft.rotation.y = THREE.MathUtils.lerp(this.saberLeft.rotation.y, currentLeftRot.y, 0.25);
    this.saberLeft.rotation.z = THREE.MathUtils.lerp(this.saberLeft.rotation.z, currentLeftRot.z, 0.25);

    this.saberRight.position.lerp(currentRightGoal, 0.25);
    this.saberRight.rotation.x = THREE.MathUtils.lerp(this.saberRight.rotation.x, currentRightRot.x, 0.25);
    this.saberRight.rotation.y = THREE.MathUtils.lerp(this.saberRight.rotation.y, currentRightRot.y, 0.25);
    this.saberRight.rotation.z = THREE.MathUtils.lerp(this.saberRight.rotation.z, currentRightRot.z, 0.25);
  }

  calculateSaberSwingAngle(cutDir, isLeft) {
    // Return Euler angle for saber blade
    // Default blade points +Y
    switch (cutDir) {
      case 0: // Up cut -> Blade swings upward (X ~ -0.6)
        return new THREE.Euler(-0.8, 0, isLeft ? 0.2 : -0.2);
      case 1: // Down cut -> Blade points forward-down (X ~ 1.4)
        return new THREE.Euler(1.5, 0, isLeft ? -0.1 : 0.1);
      case 2: // Left cut -> Blade points left (Z ~ 1.2)
        return new THREE.Euler(0.4, 0, 1.2);
      case 3: // Right cut -> Blade points right (Z ~ -1.2)
        return new THREE.Euler(0.4, 0, -1.2);
      case 4: // Up-Left -> Angle up and left
        return new THREE.Euler(-0.6, 0, 0.9);
      case 5: // Up-Right -> Angle up and right
        return new THREE.Euler(-0.6, 0, -0.9);
      case 6: // Down-Left -> Angle down and left
        return new THREE.Euler(1.2, 0, 0.9);
      case 7: // Down-Right -> Angle down and right
        return new THREE.Euler(1.2, 0, -0.9);
      default: // Dot
        return new THREE.Euler(0.6, 0, isLeft ? 0.2 : -0.2);
    }
  }

  updateHUDTelemetry() {
    const leftEl = document.getElementById('telemetry-left');
    const rightEl = document.getElementById('telemetry-right');
    const beatEl = document.getElementById('stat-beat');
    const timeEl = document.getElementById('time-display');

    if (leftEl) leftEl.innerText = `(${this.parityState.left.x},${this.parityState.left.y}) ${this.parityState.left.dir}`;
    if (rightEl) rightEl.innerText = `(${this.parityState.right.x},${this.parityState.right.y}) ${this.parityState.right.dir}`;
    if (beatEl) beatEl.innerText = this.currentBeat.toFixed(2);

    if (timeEl && this.audio) {
      const cur = this.formatTime(this.audio.currentTime || 0);
      const total = this.formatTime(this.audio.duration || 0);
      timeEl.innerText = `${cur} / ${total}`;
    }
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Play/Pause button
    const btnPlay = document.getElementById('btn-play');
    btnPlay?.addEventListener('click', () => this.togglePlay());

    if (this.audio) {
      this.audio.addEventListener('play', () => {
        this.isPlaying = true;
        const b = document.getElementById('btn-play');
        if (b) b.innerHTML = '⏸ 暂停 (Space)';
      });
      this.audio.addEventListener('pause', () => {
        this.isPlaying = false;
        const b = document.getElementById('btn-play');
        if (b) b.innerHTML = '▶ 播放 (Space)';
      });
      this.audio.addEventListener('ended', () => {
        this.isPlaying = false;
        const b = document.getElementById('btn-play');
        if (b) b.innerHTML = '▶ 播放 (Space)';
      });
    }

    // Restart button
    const btnRestart = document.getElementById('btn-restart');
    btnRestart?.addEventListener('click', () => this.restart());

    // Camera mode toggles
    document.querySelectorAll('.btn-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setCameraMode(e.target.dataset.mode);
      });
    });

    // Speed selector
    const speedSel = document.getElementById('speed-select');
    speedSel?.addEventListener('change', (e) => {
      const rate = parseFloat(e.target.value);
      if (this.audio) this.audio.playbackRate = rate;
    });

    // Timeline Scrubber
    const scrubber = document.getElementById('timeline-scrubber');
    if (scrubber && this.audio) {
      this.audio.addEventListener('timeupdate', () => {
        if (!this.isScrubbing && this.audio.duration) {
          scrubber.value = (this.audio.currentTime / this.audio.duration) * 100;
        }
      });

      scrubber.addEventListener('input', () => {
        this.isScrubbing = true;
      });

      scrubber.addEventListener('change', () => {
        if (this.audio.duration) {
          this.audio.currentTime = (scrubber.value / 100) * this.audio.duration;
        }
        this.isScrubbing = false;
      });
    }

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'KeyR') {
        this.restart();
      } else if (e.code === 'ArrowLeft') {
        if (this.audio) this.audio.currentTime = Math.max(0, this.audio.currentTime - 2.0);
      } else if (e.code === 'ArrowRight') {
        if (this.audio) this.audio.currentTime = Math.min(this.audio.duration || 100, this.audio.currentTime + 2.0);
      } else if (e.code === 'Digit1') {
        this.setCameraMode('third');
      } else if (e.code === 'Digit2') {
        this.setCameraMode('first');
      } else if (e.code === 'Digit3') {
        this.setCameraMode('free');
      }
    });

    // Drag and drop for custom map loading
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleDroppedFiles(files);
      }
    });
  }

  async handleDroppedFiles(files) {
    let datFile = null;
    let audioFile = null;

    for (const file of files) {
      if (file.name.endsWith('.dat') || file.name.endsWith('.json')) {
        datFile = file;
      } else if (file.name.endsWith('.wav') || file.name.endsWith('.mp3') || file.name.endsWith('.ogg')) {
        audioFile = file;
      }
    }

    if (audioFile && this.audio) {
      this.audio.src = URL.createObjectURL(audioFile);
      this.audio.load();
    }

    if (datFile) {
      try {
        const text = await datFile.text();
        const json = JSON.parse(text);
        if (json._notes) {
          // It's a difficulty dat
          this.loadMapData({ _beatsPerMinute: this.bpm, _songName: datFile.name }, json);
        }
      } catch (err) {
        console.error('Failed to parse dropped map:', err);
        this.showToast('无法解析导入的文件');
      }
    }
  }

  async togglePlay() {
    if (!this.audio) return;
    const btnPlay = document.getElementById('btn-play');
    if (this.audio.paused) {
      try {
        await this.audio.play();
        this.isPlaying = true;
        if (btnPlay) btnPlay.innerHTML = '⏸ 暂停 (Space)';
      } catch (e) {
        console.warn('Audio play prevented or failed:', e);
        this.showToast('点击页面后即可播放音频');
      }
    } else {
      this.audio.pause();
      this.isPlaying = false;
      if (btnPlay) btnPlay.innerHTML = '▶ 播放 (Space)';
    }
  }

  restart() {
    if (this.audio) {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      this.isPlaying = true;
      const btnPlay = document.getElementById('btn-play');
      if (btnPlay) btnPlay.innerHTML = '⏸ 暂停 (Space)';
    }
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (this.audio) {
      this.currentTime = this.audio.currentTime;
      this.currentBeat = (this.currentTime - this.timeOffset) * (this.bpm / 60.0);
    }

    this.updatePositions();

    if (this.controls.enabled) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }
}
