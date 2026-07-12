/**
 * Three.js 3D renderer for the tennis court.
 * Fixed oblique view: camera at 45° looking down at the court.
 *
 * The court and the two players are loaded from the FBX models placed in
 * ./assets (003_Tennis_court.fbx, red.fbx, blue.fbx). Procedural primitive
 * versions are still built as a fallback and are only hidden once the matching
 * model has finished loading, so the game keeps working even if a model is
 * missing or fails to download.
 */

const ASSET_BASE = 'assets/';

class Renderer3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = null;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);

    // Camera — fixed oblique view
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(0, 22, 20);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Correct colour space + gentle tone mapping so lit surfaces don't blow
    // out to pure white (the FBX court materials are fairly bright already).
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 20, 5);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.2);
    fillLight.position.set(-5, 10, -5);
    this.scene.add(fillLight);

    this._buildCourt();
    this._buildNet();

    // Ball
    const ballGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xD4E157, roughness: 0.3 });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.ball.position.set(0, 0.5, 0);
    this.scene.add(this.ball);

    // Players
    this.players = {};
    this._createPlayer('player1', 0xE53935);
    this._createPlayer('player2', 0x1E88E5);

    this._createScoreDisplay();
    this._createMessageOverlay();
    this._createChargeBar();

    // Swap in the FBX models produced in the modelling software.
    this._loadModels();

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _buildCourt() {
    this.courtGroup = new THREE.Group();

    const courtMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.8 });
    this.court = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), courtMat);
    this.court.rotation.x = -Math.PI / 2;
    this.court.receiveShadow = true;
    this.courtGroup.add(this.court);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x388E3C, roughness: 0.8 });
    for (let z = -9; z <= 9; z += 2.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.01, z);
      this.courtGroup.add(stripe);
    }

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this._addLine(lineMat, -5, 0.02, -10, 5, 0.02, -10);
    this._addLine(lineMat, -5, 0.02, -10, -5, 0.02, 10);
    this._addLine(lineMat, 5, 0.02, -10, 5, 0.02, 10);
    this._addLine(lineMat, -5, 0.02, 10, 5, 0.02, 10);
    this._addLine(lineMat, -4.5, 0.02, -3.5, 4.5, 0.02, -3.5);
    this._addLine(lineMat, -4.5, 0.02, 3.5, 4.5, 0.02, 3.5);
    this._addLine(lineMat, 0, 0.02, -3.5, 0, 0.02, 3.5);
    this._addLine(lineMat, 0, 0.02, -10, 0, 0.02, -9.5);
    this._addLine(lineMat, 0, 0.02, 10, 0, 0.02, 9.5);
    this._addLine(lineMat, -4.5, 0.02, -10, -4.5, 0.02, 10);
    this._addLine(lineMat, 4.5, 0.02, -10, 4.5, 0.02, 10);

    this.scene.add(this.courtGroup);
  }

  _addLine(mat, x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)
    ]);
    this.courtGroup.add(new THREE.Line(geo, mat));
  }

  _buildNet() {
    this.netGroup = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
    for (const x of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), postMat);
      post.position.set(x, 0.75, 0);
      this.netGroup.add(post);
    }
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, wireframe: true });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2, 20, 10), netMat);
    net.position.set(0, 0.6, 0);
    this.netGroup.add(net);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const tape = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 0.04), tapeMat);
    tape.position.set(0, 1.2, 0);
    this.netGroup.add(tape);
    this.scene.add(this.netGroup);
  }

  _createPlayer(id, color) {
    // Outer container that gets moved around by updateState().
    const group = new THREE.Group();
    // The procedural body lives in its own subgroup so it can be hidden once
    // the FBX model has loaded.
    const body = new THREE.Group();
    group.add(body);

    const skinColor = 0xFFDBAC;
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });
    const shirtMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 0.8 });

    // --- Feet / Shoes ---
    const shoeGeo = new THREE.BoxGeometry(0.16, 0.08, 0.25);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(-0.12, 0.04, 0);
    leftShoe.castShadow = true;
    body.add(leftShoe);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0.12, 0.04, 0);
    rightShoe.castShadow = true;
    body.add(rightShoe);

    // --- Legs ---
    const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8);
    const leftLeg = new THREE.Mesh(legGeo, skinMat);
    leftLeg.position.set(-0.12, 0.28, 0);
    leftLeg.castShadow = true;
    body.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, skinMat);
    rightLeg.position.set(0.12, 0.28, 0);
    rightLeg.castShadow = true;
    body.add(rightLeg);

    // --- Shorts ---
    const shortsGeo = new THREE.BoxGeometry(0.44, 0.2, 0.26);
    const shorts = new THREE.Mesh(shortsGeo, shortsMat);
    shorts.position.set(0, 0.55, 0);
    shorts.castShadow = true;
    body.add(shorts);

    // --- Torso (shirt) ---
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.45, 10);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.set(0, 0.82, 0);
    torso.castShadow = true;
    body.add(torso);

    // --- Collar detail ---
    const collarGeo = new THREE.TorusGeometry(0.18, 0.025, 6, 12);
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 1.04, 0);
    body.add(collar);

    // --- Shoulders ---
    const shoulderGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const leftShoulder = new THREE.Mesh(shoulderGeo, shirtMat);
    leftShoulder.position.set(-0.30, 0.98, 0);
    body.add(leftShoulder);
    const rightShoulder = new THREE.Mesh(shoulderGeo, shirtMat);
    rightShoulder.position.set(0.30, 0.98, 0);
    body.add(rightShoulder);

    // --- Arms ---
    const armGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.4, 8);
    // Left arm (non-racket hand) hangs down
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.32, 0.72, 0);
    leftArm.castShadow = true;
    body.add(leftArm);
    // Right arm (racket hand) extends out
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.38, 0.82, 0.05);
    rightArm.rotation.z = -Math.PI / 4;
    rightArm.castShadow = true;
    body.add(rightArm);

    // --- Hands ---
    const handGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.set(-0.32, 0.50, 0);
    body.add(leftHand);
    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.set(0.52, 0.66, 0.05);
    body.add(rightHand);

    // --- Neck ---
    const neckGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8);
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.set(0, 1.09, 0);
    body.add(neck);

    // --- Head ---
    const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.28, 0);
    head.castShadow = true;
    body.add(head);

    // --- Hair ---
    const hairGeo = new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 1.30, 0);
    body.add(hair);

    // --- Eyes ---
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.07, 1.30, 0.16);
    body.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.07, 1.30, 0.16);
    body.add(rightEye);

    // --- Headband ---
    const headbandGeo = new THREE.TorusGeometry(0.185, 0.02, 6, 16);
    const headbandMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const headband = new THREE.Mesh(headbandGeo, headbandMat);
    headband.rotation.x = Math.PI / 2;
    headband.position.set(0, 1.33, 0);
    body.add(headband);

    // --- Racket ---
    const racketGroup = new THREE.Group();
    // Handle
    const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.30, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x4E342E, roughness: 0.7 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0, -0.15, 0);
    racketGroup.add(handle);
    // Frame (ellipse-like ring)
    const frameGeo = new THREE.TorusGeometry(0.17, 0.02, 8, 20);
    const frameMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.4 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0.10, 0);
    racketGroup.add(frame);
    // Strings (flat semi-transparent disc)
    const stringsGeo = new THREE.CircleGeometry(0.155, 16);
    const stringsMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF, transparent: true, opacity: 0.35,
      roughness: 0.3, side: THREE.DoubleSide
    });
    const strings = new THREE.Mesh(stringsGeo, stringsMat);
    strings.position.set(0, 0.10, 0);
    racketGroup.add(strings);

    racketGroup.position.set(0.56, 0.60, 0.08);
    racketGroup.rotation.z = -Math.PI / 6;
    body.add(racketGroup);

    // --- Shadow circle on ground (kept on the container so it stays under the
    //     FBX model too) ---
    const shadowGeo = new THREE.CircleGeometry(0.35, 16);
    const shadowMat = new THREE.MeshStandardMaterial({
      color: 0x000000, transparent: true, opacity: 0.18, roughness: 1
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.01, 0);
    group.add(shadow);

    // Both Tripo FBX exports use the same presentation pose. Turn both toward
    // the camera-facing +Z direction so the in-game view matches the supplied
    // reference renders and shows each character's authored front texture.
    group.rotation.y = Math.PI / 2;
    // player1 defends the far baseline (z < 0) and must face the opposite way
    // so it looks across the net at its opponent instead of turning its back.
    if (id === 'player1') group.rotation.y += Math.PI;

    this.scene.add(group);
    this.players[id] = { group, body, racket: racketGroup };
  }

  /**
   * Load the FBX models exported from the modelling software and swap them in
   * for the procedural placeholders. Everything degrades gracefully: if the
   * loader or a file is unavailable the primitive version simply stays visible.
   */
  _loadModels() {
    if (typeof THREE === 'undefined' || typeof THREE.FBXLoader === 'undefined') {
      console.warn('[render] THREE.FBXLoader not available — keeping procedural models.');
      return;
    }
    const loader = new THREE.FBXLoader();

    // --- Court ---
    loader.load(
      ASSET_BASE + '003_Tennis_court.fbx',
      (obj) => {
        this._prepareModel(obj, { receiveShadow: true });
        // Align the actual painted court lines with the logical 10 x 20 world.
        // Fitting the full FBX footprint would include fences and benches and
        // shrink the playable surface to roughly 5.4 x 11.7 units.
        this._fitCourtModel(obj);
        this.scene.add(obj);
        this.courtModel = obj;
        // Hide the procedural fallbacks once the complete court model is ready.
        if (this.courtGroup) this.courtGroup.visible = false;
        if (this.netGroup) this.netGroup.visible = false;
      },
      undefined,
      (err) => console.warn('[render] Failed to load court model:', err)
    );

    // --- Players ---
    // The Tripo-exported FBX embeds its base-colour map, but r128's FBXLoader
    // does not reliably apply embedded textures — so we extracted them to
    // ./assets and bind them explicitly after the mesh loads.
    this._loadPlayerModel(ASSET_BASE + 'red.fbx', 'player1', ASSET_BASE + 'red_basecolor.jpg');
    this._loadPlayerModel(ASSET_BASE + 'blue.fbx', 'player2', ASSET_BASE + 'blue_basecolor.jpg');
  }

  /** Return world-space bounds for geometry groups using a named material. */
  _getMaterialBounds(root, materialName) {
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    const wanted = materialName.trim().toLowerCase();
    root.updateMatrixWorld(true);

    root.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geometry = child.geometry;
      const position = geometry.getAttribute('position');
      if (!position) return;
      const index = geometry.index;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const groups = geometry.groups.length ? geometry.groups : [{
        start: 0,
        count: index ? index.count : position.count,
        materialIndex: 0,
      }];

      groups.forEach((group) => {
        const material = materials[group.materialIndex || 0];
        if (!material || material.name.trim().toLowerCase() !== wanted) return;
        const limit = Math.min(group.start + group.count, index ? index.count : position.count);
        for (let offset = group.start; offset < limit; offset++) {
          const vertexIndex = index ? index.getX(offset) : offset;
          point.fromBufferAttribute(position, vertexIndex).applyMatrix4(child.matrixWorld);
          bounds.expandByPoint(point);
        }
      });
    });

    return bounds.isEmpty() ? null : bounds;
  }

  /** Fit the imported court using its painted boundary lines, not its fences. */
  _fitCourtModel(obj) {
    let lineBounds = this._getMaterialBounds(obj, 'court line');
    if (!lineBounds) {
      this._fitToGround(obj, { targetWidth: 10, targetDepth: 20 });
      return;
    }

    const size = new THREE.Vector3();
    lineBounds.getSize(size);
    const scale = Math.min(10 / size.x, 20 / size.z);
    obj.scale.setScalar(scale);
    obj.updateMatrixWorld(true);

    lineBounds = this._getMaterialBounds(obj, 'court line');
    const center = new THREE.Vector3();
    lineBounds.getCenter(center);
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= lineBounds.min.y;
  }

  _loadPlayerModel(url, id, textureUrl) {
    const loader = new THREE.FBXLoader();
    loader.load(
      url,
      (obj) => {
        this._prepareModel(obj, { castShadow: true });
        if (textureUrl) this._applyBaseColorTexture(obj, textureUrl);
        // Scale the model to a believable player height (~1.5 units) and drop
        // its feet onto the ground plane.
        this._fitToGround(obj, { targetHeight: 1.5 });
        const entry = this.players[id];
        entry.group.add(obj);
        entry.model = obj;
        // Hide the procedural body but keep the ground shadow.
        if (entry.body) entry.body.visible = false;
      },
      undefined,
      (err) => console.warn(`[render] Failed to load player model ${url}:`, err)
    );
  }

  /**
   * Bind an external base-colour (albedo) map onto every mesh of a model and
   * reset the diffuse colour to white so the texture shows at full strength.
   */
  _applyBaseColorTexture(obj, textureUrl) {
    const tex = new THREE.TextureLoader().load(textureUrl);
    tex.flipY = false; // FBX UVs use the glTF convention here
    tex.encoding = THREE.sRGBEncoding;
    obj.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m) return;
        m.map = tex;
        if (m.color) m.color.setHex(0xffffff);
        m.needsUpdate = true;
      });
    });
  }

  /** Enable lighting/shadows on every mesh of a loaded model. */
  _prepareModel(obj, { castShadow = false, receiveShadow = false } = {}) {
    const embeddedLights = [];
    obj.traverse((child) => {
      // The court FBX contains an "Area" light exported as a PointLight with
      // intensity 500. It overwhelms the scene after the model is scaled, so
      // imported models must use the renderer's controlled scene lights only.
      if (child.isLight) {
        embeddedLights.push(child);
        return;
      }
      if (child.isMesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
        // Render both faces: the Tripo meshes have inconsistent normals, and
        // FrontSide would cull the back faces, tearing holes in the model.
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { if (m) m.side = THREE.DoubleSide; });
        }
      }
    });
    embeddedLights.forEach((light) => {
      if (light.parent) light.parent.remove(light);
    });
  }

  /**
   * Uniformly scale a model to a target size and rest it on the ground (y = 0),
   * centred on the origin in the X/Z plane. Any of targetWidth / targetDepth /
   * targetHeight may be supplied; the smallest resulting scale is used so the
   * model always fits within every provided constraint.
   */
  _fitToGround(obj, { targetWidth, targetDepth, targetHeight } = {}) {
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);

    const candidates = [];
    if (targetWidth && size.x > 1e-6) candidates.push(targetWidth / size.x);
    if (targetDepth && size.z > 1e-6) candidates.push(targetDepth / size.z);
    if (targetHeight && size.y > 1e-6) candidates.push(targetHeight / size.y);
    const scale = candidates.length ? Math.min(...candidates) : 1;
    obj.scale.setScalar(scale);

    // Recompute the box after scaling to centre and ground the model.
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= box.min.y;
  }

  _createScoreDisplay() {
    const div = document.createElement('div');
    div.id = 'score-display';
    div.style.cssText = `position:absolute;top:20px;left:50%;transform:translateX(-50%);
      color:#fff;font-family:'Courier New',monospace;font-size:28px;font-weight:bold;
      text-align:center;background:rgba(0,0,0,0.6);padding:10px 30px;border-radius:8px;z-index:10;`;
    div.innerHTML = '0 - 0';
    this.container.appendChild(div);
    this.scoreDisplay = div;

    const labels = document.createElement('div');
    labels.id = 'player-labels';
    labels.style.cssText = `position:absolute;top:70px;left:50%;transform:translateX(-50%);
      display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:6px 28px;
      width:min(680px,calc(100% - 32px));font-size:14px;line-height:1.2;z-index:10;
      pointer-events:none;`;
    this.container.appendChild(labels);

    const p1 = document.createElement('div');
    p1.style.cssText = `color:#E53935;white-space:nowrap;text-align:center;`;
    p1.textContent = 'PLAYER 1 (WASD + J/K/L/U)';
    labels.appendChild(p1);

    const p2 = document.createElement('div');
    p2.style.cssText = `color:#1E88E5;white-space:nowrap;text-align:center;`;
    p2.textContent = 'PLAYER 2 (ARROWS + J/K/L/U)';
    labels.appendChild(p2);
    this.playerLabels = { player1: p1, player2: p2 };
  }

  setLocalPlayer(playerId) {
    if (!this.playerLabels) return;
    const configs = {
      player1: { number: 1, controls: 'WASD + J/K/L/U' },
      player2: { number: 2, controls: 'ARROWS + J/K/L/U' },
    };
    Object.entries(this.playerLabels).forEach(([id, label]) => {
      const config = configs[id];
      const isLocal = id === playerId;
      label.textContent = `${isLocal ? 'YOU' : 'OPPONENT'} · PLAYER ${config.number} (${config.controls})`;
      label.style.opacity = isLocal ? '1' : '0.45';
      label.style.fontWeight = isLocal ? '700' : '400';
    });
  }

  _createMessageOverlay() {
    const el = document.createElement('div');
    el.id = 'message-overlay';
    el.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      color:#fff;font-family:'Courier New',monospace;font-size:48px;font-weight:bold;
      text-align:center;text-shadow:2px 2px 4px rgba(0,0,0,0.8);
      z-index:20;pointer-events:none;opacity:0;transition:opacity 0.3s;`;
    this.container.appendChild(el);
    this.messageOverlay = el;
  }

  _createChargeBar() {
    const wrap = document.createElement('div');
    wrap.id = 'charge-bar';
    wrap.style.cssText = `position:absolute;bottom:64px;left:50%;transform:translateX(-50%);
      width:220px;height:16px;background:rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.4);
      border-radius:10px;overflow:hidden;z-index:15;opacity:0;transition:opacity 0.12s;
      pointer-events:none;`;
    const fill = document.createElement('div');
    fill.style.cssText = `height:100%;width:0%;border-radius:6px;
      background:linear-gradient(90deg,#4CAF50,#FFC107,#F44336);transition:width 0.05s linear;`;
    wrap.appendChild(fill);
    this.container.appendChild(wrap);
    this.chargeBar = wrap;
    this.chargeBarFill = fill;
  }

  /**
   * Update the charge bar from the local input's charge state.
   * @param {{charging: boolean, power: number}} chargeState
   */
  updateChargeBar(chargeState) {
    if (!this.chargeBar) return;
    if (chargeState && chargeState.charging) {
      this.chargeBar.style.opacity = '1';
      this.chargeBarFill.style.width = `${Math.round(chargeState.power * 100)}%`;
    } else {
      this.chargeBar.style.opacity = '0';
    }
  }

  showMessage(text, durationMs = 2000) {
    this.messageOverlay.textContent = text;
    this.messageOverlay.style.opacity = '1';
    setTimeout(() => { this.messageOverlay.style.opacity = '0'; }, durationMs);
  }


  updateScore(score) {
    const POINT_LABELS = ['0', '15', '30', '40', 'AD'];
    const p1l = POINT_LABELS[Math.min(score.p1Points, 4)] || 'AD';
    const p2l = POINT_LABELS[Math.min(score.p2Points, 4)] || 'AD';
    let st = `${p1l} - ${p2l}`;
    if (score.isDeuce) st = 'DEUCE';
    if (score.p1Points >= 4 && score.p1Points - score.p2Points === 1) st = 'AD P1';
    if (score.p2Points >= 4 && score.p2Points - score.p1Points === 1) st = 'AD P2';
    this.scoreDisplay.innerHTML = `<span style="color:#E53935">${score.p1Games}</span> ${st} <span style="color:#1E88E5">${score.p2Games}</span>`;
  }

  updateState(state) {
    this.state = state;
    if (!state || !state.ball) return;
    this.ball.position.set(state.ball.x, state.ball.y, state.ball.z);
    this.ball.rotation.z = state.ball.rotation || 0;
    if (state.player1) this.players.player1.group.position.set(state.player1.x, 0, state.player1.z);
    if (state.player2) this.players.player2.group.position.set(state.player2.x, 0, state.player2.z);
    if (state.score) this.updateScore(state.score);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    window.rem