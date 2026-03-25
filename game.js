(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const moneyEl = document.getElementById('money');
  const livesEl = document.getElementById('lives');
  const waveEl = document.getElementById('wave');
  const scoreEl = document.getElementById('score');
  const startBtn = document.getElementById('startBtn');
  const upgradeBtn = document.getElementById('upgradeBtn');
  const towerButtons = [...document.querySelectorAll('[data-tower]')];

  let path = smoothPath(generatePath());

  let pads = generatePads(path, 10);

  const towerDefs = {
    spine: { name: 'Spine Torso', cost: 30, range: 180, fireRate: 0.55, damage: 24, color: '#8bff8c' },
    hydra: { name: 'Hydra Torso', cost: 60, range: 275, fireRate: 0.30, damage: 18, color: '#67d7ff' },
    ultra: { name: 'Ultra Torso', cost: 80, range: 115, fireRate: 0.80, damage: 52, color: '#ff93d2' }
  };

  const enemyDefs = {
    raider:   { hp: 55,  speed: 72, reward: 12, color: '#61b7ff' },
    marauder: { hp: 90,  speed: 54, reward: 18, color: '#4f84ff' },
    zealot:   { hp: 110, speed: 66, reward: 22, color: '#ffd66d' },
    stalker:  { hp: 145, speed: 58, reward: 30, color: '#c58cff' },
    colossus: { hp: 360, speed: 34, reward: 80, color: '#ff9a63', boss: true }
  };

  const state = {
    money: 140,
    lives: 20,
    wave: 0,
    score: 0,
    selectedTowerType: 'spine',
    selectedPadIndex: null,
    towers: [],
    enemies: [],
    projectiles: [],
    waveQueue: [],
    spawnTimer: 0,
    lastTime: 0,
    gameOver: false
  };

  const spriteSheet = new Image();
  spriteSheet.src = 'zergspire_spritesheet.png';

  const SPRITE_CELL = 128;
  const sprites = {
    spine:    { sx: 0 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 86, h: 86, ox: 43, oy: 60 },
    hydra:    { sx: 1 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 92, h: 92, ox: 46, oy: 66 },
    ultra:    { sx: 2 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 96, h: 96, ox: 48, oy: 72 },
    raider:   { sx: 3 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 40, h: 40, ox: 20, oy: 28 },
    marauder: { sx: 0 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 48, h: 48, ox: 24, oy: 34 },
    zealot:   { sx: 1 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 42, h: 42, ox: 21, oy: 29 },
    stalker:  { sx: 2 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 46, h: 46, ox: 23, oy: 32 },
    colossus: { sx: 3 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 68, h: 68, ox: 34, oy: 52 }
  };

  function setActiveButton() {
    towerButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tower === state.selectedTowerType));
  }
  setActiveButton();

  towerButtons.forEach(btn => btn.addEventListener('click', () => {
    state.selectedTowerType = btn.dataset.tower;
    setActiveButton();
  }));

  startBtn.addEventListener('click', startWave);
  upgradeBtn.addEventListener('click', upgradeSelected);

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pathPosition(seg, t) {
    const a = path[seg];
    const b = path[seg + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function makeEnemy(kind) {
    const def = enemyDefs[kind];
    return {
      kind,
      ...def,
      maxHp: def.hp,
      seg: 0,
      t: 0,
      x: path[0].x,
      y: path[0].y
    };
  }

  function startWave() {
    if (state.waveQueue.length || state.gameOver) return;
    state.wave += 1;
    const q = [];
    const pushMany = (k, n) => {
      for (let i = 0; i < n; i++) q.push(k);
    };

    pushMany('raider', 4 + state.wave * 2);
    if (state.wave >= 2) pushMany('marauder', 2 + state.wave);
    if (state.wave >= 3) pushMany('zealot', 2 + state.wave);
    if (state.wave >= 5) pushMany('stalker', 1 + Math.floor(state.wave * 0.8));
    if (state.wave % 4 === 0) pushMany('colossus', 1);

    state.waveQueue = q;
    state.spawnTimer = 0;
    syncHud();
  }

  function syncHud() {
    moneyEl.textContent = state.money;
    livesEl.textContent = state.lives;
    waveEl.textContent = state.wave;
    scoreEl.textContent = state.score;
  }

  function placeTower(index) {
    if (state.towers[index]) return;
    const def = towerDefs[state.selectedTowerType];
    if (state.money < def.cost) return;

    state.money -= def.cost;
    state.towers[index] = {
      type: state.selectedTowerType,
      level: 1,
      cooldown: 0,
      ...JSON.parse(JSON.stringify(def)),
      x: pads[index].x,
      y: pads[index].y
    };
    state.selectedPadIndex = index;
    syncHud();
  }

  function upgradeSelected() {
    const i = state.selectedPadIndex;
    if (i == null || !state.towers[i]) return;

    const tower = state.towers[i];
    const cost = 80 * tower.level;
    if (state.money < cost || tower.level >= 4) return;

    state.money -= cost;
    tower.level += 1;
    tower.damage = Math.round(tower.damage * 1.35);
    tower.range += 12;
    tower.fireRate *= 0.92;
    syncHud();
  }

  function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const touch = evt.touches ? evt.touches[0] : evt;
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  function handlePointer(evt) {
    const p = getCanvasPos(evt);
    for (let i = 0; i < pads.length; i++) {
      if (dist(p, pads[i]) < 32) {
        if (state.towers[i]) state.selectedPadIndex = i;
        else placeTower(i);
        return;
      }
    }
    state.selectedPadIndex = null;
  }

  canvas.addEventListener('click', handlePointer);
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    handlePointer(e);
  }, { passive: false });

  function update(dt) {
    if (state.gameOver) return;

    if (state.waveQueue.length) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.enemies.push(makeEnemy(state.waveQueue.shift()));
        state.spawnTimer = 0.75;
      }
    }

    for (const enemy of state.enemies) {
      const a = path[enemy.seg];
      const b = path[enemy.seg + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      enemy.t += (enemy.speed * dt) / len;

      if (enemy.t >= 1) {
        enemy.seg += 1;
        enemy.t = 0;
        if (enemy.seg >= path.length - 1) {
          enemy.dead = true;
          state.lives -= enemy.boss ? 4 : 1;
          if (state.lives <= 0) {
            state.lives = 0;
            state.gameOver = true;
          }
          continue;
        }
      }

      const pos = pathPosition(enemy.seg, enemy.t);
      enemy.x = pos.x;
      enemy.y = pos.y;
    }

    for (const tower of state.towers) {
      if (!tower) continue;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;

      let target = null;
      let bestSeg = -1;
      let bestT = -1;

      for (const e of state.enemies) {
        if (e.dead) continue;
        if (dist(tower, e) <= tower.range) {
          if (e.seg > bestSeg || (e.seg === bestSeg && e.t > bestT)) {
            bestSeg = e.seg;
            bestT = e.t;
            target = e;
          }
        }
      }

      if (target) {
        state.projectiles.push({
          x: tower.x,
          y: tower.y - 18,
          tx: target.x,
          ty: target.y,
          target,
          damage: tower.damage,
          speed: 360,
          color: tower.color
        });
        tower.cooldown = tower.fireRate;
      }
    }

    for (const p of state.projectiles) {
      if (!p.target || p.target.dead) {
        p.dead = true;
        continue;
      }

      const dx = p.target.x - p.x;
      const dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);

      if (d < 10) {
        p.target.hp -= p.damage;
        if (p.target.hp <= 0 && !p.target.dead) {
          p.target.dead = true;
          state.money += p.target.reward;
          state.score += p.target.reward;
        }
        p.dead = true;
      } else {
        p.x += (dx / d) * p.speed * dt;
        p.y += (dy / d) * p.speed * dt;
      }
    }

    state.enemies = state.enemies.filter(e => !e.dead);
    state.projectiles = state.projectiles.filter(p => !p.dead);
    syncHud();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#132132');
    g.addColorStop(1, '#071018');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 90; i++) {
      const x = (i * 137) % W;
      const y = (i * 79) % H;
      ctx.fillStyle = i % 7 === 0 ? '#1d3f2e' : '#17334d';
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.lineWidth = 26;
    ctx.strokeStyle = '#6a5b46';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();

    ctx.lineWidth = 10;
    ctx.strokeStyle = '#9a8867';
    ctx.stroke();

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      ctx.beginPath();
      ctx.fillStyle = state.selectedPadIndex === i ? '#385c49' : '#243241';
      ctx.arc(pad.x, pad.y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#61829f';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawSprite(key, x, y, opts = {}) {
    const s = sprites[key];
    if (!s || !spriteSheet.complete || !spriteSheet.naturalWidth) return false;

    const w = opts.w ?? s.w;
    const h = opts.h ?? s.h;
    const ox = opts.ox ?? s.ox;
    const oy = opts.oy ?? s.oy;

    ctx.drawImage(
      spriteSheet,
      s.sx, s.sy, s.sw, s.sh,
      x - ox, y - oy, w, h
    );
    return true;
  }

  function drawTowerFallback(t) {
    ctx.save();
    ctx.translate(t.x, t.y);
    const colors = { spine: '#59f57f', hydra: '#60d8ff', ultra: '#ff7cd0' };
    ctx.fillStyle = colors[t.type];
    ctx.strokeStyle = '#102022';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(0, -35);
    ctx.lineTo(18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d7ffe1';
    ctx.beginPath();
    ctx.arc(-7, -3, 3, 0, Math.PI * 2);
    ctx.arc(7, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyFallback(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === 'raider' || e.kind === 'marauder') {
      ctx.fillStyle = e.color;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.fillStyle = '#c7e3ff';
      ctx.fillRect(-4, -18, 8, 8);
    } else if (e.kind === 'zealot' || e.kind === 'stalker') {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, 16);
      ctx.lineTo(-14, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = e.color;
      ctx.fillRect(-14, -22, 28, 44);
      ctx.fillStyle = '#fff2cf';
      ctx.fillRect(-6, -28, 12, 8);
    }
    ctx.restore();
  }

  function drawTower(t) {
    ctx.save();

    const selected = state.selectedPadIndex != null && state.towers[state.selectedPadIndex] === t;
    if (selected) {
      ctx.beginPath();
      ctx.strokeStyle = '#9cffb2';
      ctx.lineWidth = 2;
      ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      ctx.stroke();
    }

    const drawn = drawSprite(t.type, t.x, t.y);
    if (!drawn) drawTowerFallback(t);

    for (let i = 0; i < t.level; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(t.x - 14 + i * 8, t.y + 34, 5, 5);
    }

    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    const drawn = drawSprite(e.kind, e.x, e.y);
    if (!drawn) drawEnemyFallback(e);

    ctx.fillStyle = '#00000088';
    ctx.fillRect(e.x - 16, e.y - 34, 32, 5);

    ctx.fillStyle = '#6dff76';
    ctx.fillRect(e.x - 16, e.y - 34, 32 * Math.max(0, e.hp / e.maxHp), 5);
    ctx.restore();
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOverlay() {
    if (!state.gameOver) return;
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px Arial';
    ctx.fillText('Hive Collapsed', W / 2, H / 2 - 20);
    ctx.font = '24px Arial';
    ctx.fillText(`Final Score: ${state.score}`, W / 2, H / 2 + 20);
  }

  function render() {
    drawBackground();
    state.towers.forEach(t => t && drawTower(t));
    state.enemies.forEach(drawEnemy);
    drawProjectiles();
    drawOverlay();
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - state.lastTime) / 1000 || 0.016);
    state.lastTime = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function generatePath(cols = 10, rows = 6) {
  const cellW = W / cols;
  const cellH = H / rows;

  const visited = new Set();
  const pathCells = [];

  let x = 0;
  let y = Math.floor(rows / 2);

  function key(x, y) { return `${x},${y}`; }

  pathCells.push({ x, y });
  visited.add(key(x, y));

  while (x < cols - 1) {
    const moves = [];

    // always allow right
    moves.push({ dx: 1, dy: 0 });

    // allow vertical moves but limit chaos
    if (y > 1) moves.push({ dx: 0, dy: -1 });
    if (y < rows - 2) moves.push({ dx: 0, dy: 1 });

    // weighted randomness
    const move = moves[Math.floor(Math.random() * moves.length)];

    const nx = x + move.dx;
    const ny = y + move.dy;

    if (!visited.has(key(nx, ny))) {
      x = nx;
      y = ny;
      pathCells.push({ x, y });
      visited.add(key(x, y));
    }
  }

  // convert to pixel coordinates
  return pathCells.map(c => ({
    x: c.x * cellW + cellW / 2,
    y: c.y * cellH + cellH / 2
  }));
}

function smoothPath(path) {
  const result = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];

    result.push(a);

    // insert midpoint
    result.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    });
  }
  result.push(path[path.length - 1]);
  return result;
}

function generatePads(path, count = 10, theme = 'balanced') {
  const pads = [];
  const candidates = [];

  let minOffset = 70;
  let maxOffset = 110;

  if (theme === 'sniper') {
    minOffset = 95;
    maxOffset = 150;
  } else if (theme === 'maze') {
    minOffset = 60;
    maxOffset = 90;
  } else if (theme === 'wide') {
    minOffset = 85;
    maxOffset = 130;
  }

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;

    const nx = -dy / len;
    const ny = dx / len;

    for (const side of [-1, 1]) {
      const offset = minOffset + Math.random() * (maxOffset - minOffset);
      const jitter = 14;

      const candidate = {
        x: mx + nx * offset * side + (Math.random() * 2 - 1) * jitter,
        y: my + ny * offset * side + (Math.random() * 2 - 1) * jitter
      };

      if (isPadValid(candidate, candidates, path)) {
        candidates.push(candidate);
      }
    }
  }

  // prefer candidates near corners / high-coverage areas later
  shuffleInPlace(candidates);

  for (const c of candidates) {
    if (pads.length >= count) break;
    if (isPadValid(c, pads, path)) pads.push(c);
  }

  return pads;
}

function regenerateMap() {
  path = smoothPath(generatePath());
  pads = generatePads(path, 10);

  state.towers = [];
  state.enemies = [];
  state.projectiles = [];
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq === 0) return Math.hypot(px - ax, py - ay);

  const t = clamp(((px - ax) * abx + (py - ay) * aby) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function pointToPolylineDistance(p, polyline) {
  let best = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const d = pointToSegmentDistance(p.x, p.y, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}

function isPadValid(candidate, pads, path) {
  const PAD_RADIUS = 28;
  const ROAD_CLEARANCE = 60;   // tune 56-64
  const PAD_SPACING = 72;      // tune 68-90
  const EDGE_MARGIN = 36;

  // in bounds
  if (
    candidate.x < EDGE_MARGIN ||
    candidate.x > W - EDGE_MARGIN ||
    candidate.y < EDGE_MARGIN ||
    candidate.y > H - EDGE_MARGIN
  ) return false;

  // far enough from road
  if (pointToPolylineDistance(candidate, path) < ROAD_CLEARANCE) return false;

  // far enough from other pads
  for (const p of pads) {
    if (Math.hypot(candidate.x - p.x, candidate.y - p.y) < PAD_SPACING) return false;
  }

  return true;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'r') regenerateMap();
});

syncHud();
  requestAnimationFrame(loop);
})();
