/**
 * Three.js 3D renderer for the tennis court.
 * Fixed oblique view: camera at 45° looking down at the court.
 */

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
    this.camera.position.set(0, 14, 12);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 5);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
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

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _buildCourt() {
    const courtMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.8 });
    this.court = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), courtMat);
    this.court.rotation.x = -Math.PI / 2;
    this.court.receiveShadow = true;
    this.scene.add(this.court);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x388E3C, roughness: 0.8 });
    for (let z = -9; z <= 9; z += 2.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.01, z);
      this.scene.add(stripe);
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
  }

  _addLine(mat, x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)
    ]);
    this.scene.add(new THREE.Line(geo, mat));
  }

  _buildNet() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
    for (const x of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), postMat);
      post.position.set(x, 0.75, 0);
      this.scene.add(post);
    }
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, wireframe: true });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2, 20, 10), netMat);
    net.position.set(0, 0.6, 0);
    this.scene.add(net);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const tape = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 0.04), tapeMat);
    tape.position.set(0, 1.2, 0);
    this.scene.add(tape);
  }

  _createPlayer(id, color) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8), bodyMat);
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xFFDBAC, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
    head.position.y = 1.0;
    head.castShadow = true;
    group.add(head);
    const racketMat = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, roughness: 0.3 });
    const racket = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), racketMat);
    racket.position.set(0.45, 0.6, 0);
    group.add(racket);
    this.scene.add(group);
    this.players[id] = { group, racket };
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
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
