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

  const ROAD_WIDTH = 26;
  const ROAD_HALF = ROAD_WIDTH / 2;
  const PAD_RADIUS = 28;
  const PAD_CLEARANCE = 22;
  const PAD_SPACING = 78;
  const EDGE_MARGIN = 38;
  const PAD_MIN_USEFUL_DIST = 64;
  const PAD_MAX_USEFUL_DIST = 170;

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

  const spriteSheet = new Image();
  spriteSheet.src = 'zergspire_spritesheet.png';

  const SPRITE_CELL = 128;
  const sprites = {
    spine:    { sx: 0 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 86, h: 86, ox: 43, oy: 60 },
    hydra:    { sx: 1 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 72, h: 92, ox: 46, oy: 66 },
    ultra:    { sx: 2 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 96, h: 96, ox: 68, oy: 72 },
    raider:   { sx: 3 * SPRITE_CELL, sy: 0 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 40, h: 40, ox: 20, oy: 28 },
    marauder: { sx: 0 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 48, h: 48, ox: 24, oy: 34 },
    zealot:   { sx: 1 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 37, h: 42, ox: 21, oy: 29 },
    stalker:  { sx: 2 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 44, h: 46, ox: 23, oy: 32 },
    colossus: { sx: 3 * SPRITE_CELL, sy: 1 * SPRITE_CELL, sw: SPRITE_CELL, sh: SPRITE_CELL, w: 68, h: 68, ox: 34, oy: 52 }
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

  let currentTheme = 'balanced';
  let currentSeed = '';
  let rng = Math.random;
  let path = [];
  let pads = [];

  const controls = createMapControls();
  const themeSelect = controls.themeSelect;
  const seedInput = controls.seedInput;
  const regenBtn = controls.regenBtn;
  const mapInfo = controls.mapInfo;

  initFromUrlOrDefaults();

  function initFromUrlOrDefaults() {
    const params = new URLSearchParams(location.search);
    const urlTheme = params.get('theme');
    const urlSeed = params.get('seed');

    if (urlTheme && ['balanced', 'sniper', 'maze'].includes(urlTheme)) {
      currentTheme = urlTheme;
    }
    currentSeed = urlSeed || generateRandomSeed();

    themeSelect.value = currentTheme;
    seedInput.value = currentSeed;

    regenerateMap({
      theme: currentTheme,
      seed: currentSeed,
      resetEconomy: false
    });
  }

  function createMapControls() {
    const actionPanel = startBtn.closest('.panel, .controls, .hud, .card') || startBtn.parentElement;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    row.style.marginTop = '10px';

    const themeSelect = document.createElement('select');
    themeSelect.innerHTML = `
      <option value="balanced">Balanced</option>
      <option value="sniper">Sniper</option>
      <option value="maze">Maze</option>
    `;
    themeSelect.style.padding = '10px 12px';
    themeSelect.style.borderRadius = '12px';
    themeSelect.style.border = '1px solid #46627e';
    themeSelect.style.background = '#132132';
    themeSelect.style.color = '#dbe7f3';
    themeSelect.style.fontSize = '16px';

    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.placeholder = 'seed';
    seedInput.style.padding = '10px 12px';
    seedInput.style.borderRadius = '12px';
    seedInput.style.border = '1px solid #46627e';
    seedInput.style.background = '#132132';
    seedInput.style.color = '#dbe7f3';
    seedInput.style.fontSize = '16px';
    seedInput.style.minWidth = '120px';

    const regenBtn = document.createElement('button');
    regenBtn.textContent = 'Regenerate';
    regenBtn.style.padding = '10px 14px';
    regenBtn.style.borderRadius = '14px';
    regenBtn.style.border = '1px solid #46627e';
    regenBtn.style.background = '#18283d';
    regenBtn.style.color = '#f1f6ff';
    regenBtn.style.fontSize = '16px';
    regenBtn.style.cursor = 'pointer';

    const mapInfo = document.createElement('div');
    mapInfo.style.width = '100%';
    mapInfo.style.fontSize = '13px';
    mapInfo.style.color = '#9eb6cf';
    mapInfo.style.marginTop = '2px';

    row.appendChild(themeSelect);
    row.appendChild(seedInput);
    row.appendChild(regenBtn);
    row.appendChild(mapInfo);

    actionPanel.appendChild(row);

    return { themeSelect, seedInput, regenBtn, mapInfo };
  }

  function setActiveButton() {
    towerButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tower === state.selectedTowerType);
    });
  }
  setActiveButton();

  towerButtons.forEach(btn => btn.addEventListener('click', () => {
    state.selectedTowerType = btn.dataset.tower;
    setActiveButton();
  }));

  startBtn.addEventListener('click', startWave);
  upgradeBtn.addEventListener('click', upgradeSelected);

  themeSelect.addEventListener('change', () => {
    currentTheme = themeSelect.value;
  });

  regenBtn.addEventListener('click', () => {
    const seed = seedInput.value.trim() || generateRandomSeed();
    currentTheme = themeSelect.value;
    currentSeed = seed;
    seedInput.value = currentSeed;
    regenerateMap({
      theme: currentTheme,
      seed: currentSeed,
      resetEconomy: true
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'r') return;
    e.preventDefault();

    currentTheme = themeSelect.value;

    if (e.shiftKey) {
      currentSeed = seedInput.value.trim() || generateRandomSeed();
    } else {
      currentSeed = generateRandomSeed();
      seedInput.value = currentSeed;
    }

    regenerateMap({
      theme: currentTheme,
      seed: currentSeed,
      resetEconomy: true
    });
  });

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function() {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRngFromSeed(seed) {
    const seedFn = xmur3(String(seed));
    return mulberry32(seedFn());
  }

  function rand() {
    return rng();
  }

  function randInt(min, maxInclusive) {
    return Math.floor(lerp(min, maxInclusive + 1, rand()));
  }

  function pickWeighted(items) {
    let total = 0;
    for (const item of items) total += item.w;
    let r = rand() * total;
    for (const item of items) {
      r -= item.w;
      if (r <= 0) return item.value;
    }
    return items[items.length - 1].value;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function generateRandomSeed() {
    return Math.floor(Date.now() % 1000000000).toString(36);
  }

  function pathPosition(seg, t) {
    const a = path[seg];
    const b = path[seg + 1];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
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

  function segmentRectIntersectsExisting(ax, ay, bx, by, occupied) {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);

    for (const cell of occupied) {
      if (cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY) {
        return true;
      }
    }
    return false;
  }

  function smoothOrthogonalPath(points) {
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      if (prev.x !== cur.x && prev.y !== cur.y) {
        out.push({ x: cur.x, y: prev.y });
      }
      out.push(cur);
    }
    return out;
  }

  function generatePath(theme = 'balanced') {
    const cfg = {
      balanced: { cols: 10, rows: 6, startRowMin: 2, startRowMax: 3, vertBias: 0.42, maxVertRun: 2 },
      sniper:   { cols: 10, rows: 5, startRowMin: 2, startRowMax: 2, vertBias: 0.20, maxVertRun: 1 },
      maze:     { cols: 11, rows: 7, startRowMin: 2, startRowMax: 4, vertBias: 0.68, maxVertRun: 3 }
    }[theme] || {
      cols: 10, rows: 6, startRowMin: 2, startRowMax: 3, vertBias: 0.42, maxVertRun: 2
    };

    const cols = cfg.cols;
    const rows = cfg.rows;
    const occupied = [];
    const cells = [];

    let x = 0;
    let y = randInt(cfg.startRowMin, cfg.startRowMax);
    let vertRun = 0;

    cells.push({ x, y });
    occupied.push({ x, y });

    while (x < cols - 1) {
      const moves = [];

      moves.push({ value: 'right', w: theme === 'sniper' ? 6 : theme === 'maze' ? 2.4 : 4 });

      if (vertRun < cfg.maxVertRun) {
        if (y > 1) moves.push({ value: 'up', w: cfg.vertBias });
        if (y < rows - 2) moves.push({ value: 'down', w: cfg.vertBias });
      }

      let chosen = pickWeighted(moves);

      if (x >= cols - 2) chosen = 'right';

      let nx = x;
      let ny = y;

      if (chosen === 'right') nx += 1;
      else if (chosen === 'up') ny -= 1;
      else if (chosen === 'down') ny += 1;

      if (cells.length >= 2) {
        const prev = cells[cells.length - 2];
        if (prev.x === nx && prev.y === ny) {
          chosen = 'right';
          nx = x + 1;
          ny = y;
        }
      }

      if (occupied.some(c => c.x === nx && c.y === ny)) {
        if (x < cols - 1) {
          nx = x + 1;
          ny = y;
          chosen = 'right';
        }
      }

      if (chosen === 'right') {
        vertRun = 0;
      } else {
        vertRun += 1;
      }

      occupied.push({ x: nx, y: ny });
      cells.push({ x: nx, y: ny });
      x = nx;
      y = ny;
    }

    const leftMargin = 48;
    const rightMargin = 48;
    const topMargin = 72;
    const bottomMargin = 72;

    const cellW = (W - leftMargin - rightMargin) / (cols - 1);
    const cellH = (H - topMargin - bottomMargin) / (rows - 1);

    let points = cells.map(c => ({
      x: leftMargin + c.x * cellW,
      y: topMargin + c.y * cellH
    }));

    points = smoothOrthogonalPath(points);

    const entry = { x: -40, y: points[0].y };
    const exit = { x: W + 30, y: points[points.length - 1].y };
    return [entry, ...points, exit];
  }

  function segmentExposureScore(a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return len;
  }

  function cornerStrength(polyline, i) {
    if (i <= 0 || i >= polyline.length - 1) return 0;
    const a = polyline[i - 1];
    const b = polyline[i];
    const c = polyline[i + 1];

    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 1 || len2 < 1) return 0;
    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    return 1 - Math.abs(dot);
  }

  function isPadValid(candidate, existingPads, polyline) {
    if (
      candidate.x < EDGE_MARGIN ||
      candidate.x > W - EDGE_MARGIN ||
      candidate.y < EDGE_MARGIN ||
      candidate.y > H - EDGE_MARGIN
    ) return false;

    const roadDist = pointToPolylineDistance(candidate, polyline);
    if (roadDist < PAD_MIN_USEFUL_DIST) return false;
    if (roadDist > PAD_MAX_USEFUL_DIST) return false;

    for (const p of existingPads) {
      if (Math.hypot(candidate.x - p.x, candidate.y - p.y) < PAD_SPACING) return false;
    }

    return true;
  }

  function generatePads(polyline, count = 10, theme = 'balanced') {
    const candidates = [];

    const offsetRanges = {
      balanced: [76, 128],
      sniper: [105, 158],
      maze: [66, 112]
    };
    const [minOffset, maxOffset] = offsetRanges[theme] || [76, 128];

    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i];
      const b = polyline[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 20) continue;

      const nx = -dy / len;
      const ny = dx / len;

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      const turnBias = cornerStrength(polyline, i) + cornerStrength(polyline, i + 1);
      const exposure = segmentExposureScore(a, b);

      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const offset = lerp(minOffset, maxOffset, rand());
          const along = lerp(0.22, 0.78, rand());
          const jitter = theme === 'maze' ? 10 : 7;

          const px = lerp(a.x, b.x, along) + nx * offset * side + lerp(-jitter, jitter, rand());
          const py = lerp(a.y, b.y, along) + ny * offset * side + lerp(-jitter, jitter, rand());

          const candidate = { x: px, y: py };
          const roadDist = pointToPolylineDistance(candidate, polyline);
          const score =
            exposure * 0.6 +
            turnBias * 140 +
            (PAD_MAX_USEFUL_DIST - Math.abs(roadDist - ((PAD_MIN_USEFUL_DIST + PAD_MAX_USEFUL_DIST) / 2))) * 0.8;

          candidates.push({ ...candidate, score });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const padsOut = [];
    for (const c of candidates) {
      if (padsOut.length >= count) break;
      if (isPadValid(c, padsOut, polyline)) {
        padsOut.push({ x: c.x, y: c.y });
      }
    }

    if (padsOut.length < count) {
      for (let tries = 0; tries < 500 && padsOut.length < count; tries++) {
        const seg = randInt(0, polyline.length - 2);
        const a = polyline[seg];
        const b = polyline[seg + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;

        const nx = -dy / len;
        const ny = dx / len;
        const along = rand();
        const side = rand() < 0.5 ? -1 : 1;
        const offset = lerp(minOffset, maxOffset, rand());

        const candidate = {
          x: lerp(a.x, b.x, along) + nx * offset * side,
          y: lerp(a.y, b.y, along) + ny * offset * side
        };

        if (isPadValid(candidate, padsOut, polyline)) {
          padsOut.push(candidate);
        }
      }
    }

    return padsOut;
  }

  function updateMapInfo() {
    mapInfo.textContent = `Theme: ${currentTheme} · Seed: ${currentSeed} · R = random seed · Shift+R = current seed`;
  }

  function resetGameStateEconomy() {
    state.money = 140;
    state.lives = 20;
    state.wave = 0;
    state.score = 0;
    state.gameOver = false;
    state.waveQueue = [];
    state.spawnTimer = 0;
    state.selectedPadIndex = null;
  }

  function clearBoardUnits() {
    state.towers = [];
    state.enemies = [];
    state.projectiles = [];
    state.waveQueue = [];
    state.spawnTimer = 0;
    state.selectedPadIndex = null;
  }

  function regenerateMap({ theme = currentTheme, seed = currentSeed, resetEconomy = true } = {}) {
    currentTheme = theme;
    currentSeed = seed;
    rng = makeRngFromSeed(currentSeed);

    path = generatePath(currentTheme);
    pads = generatePads(path, 10, currentTheme);

    clearBoardUnits();
    if (resetEconomy) resetGameStateEconomy();

    themeSelect.value = currentTheme;
    seedInput.value = currentSeed;
    updateMapInfo();
    updateUrlQuery();
    syncHud();
  }

  function updateUrlQuery() {
    const params = new URLSearchParams(location.search);
    params.set('theme', currentTheme);
    params.set('seed', currentSeed);
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newUrl);
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
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
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
      const x = ((i * 137) % W);
      const y = ((i * 79) % H);
      ctx.fillStyle = i % 7 === 0 ? '#1d3f2e' : '#17334d';
      ctx.fillRect(x, y, 2, 2);
    }

    for (let x = 140; x < W; x += 140) {
      ctx.fillStyle = '#1c4d7a55';
      for (let y = 10; y < H; y += 15) {
        ctx.fillRect(x, y, 2, 2);
      }
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
      ctx.arc(pad.x, pad.y, PAD_RADIUS, 0, Math.PI * 2);
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

  syncHud();
  requestAnimationFrame(loop);
})();
