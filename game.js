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

  const path = [
    {x: -40, y: 120},
    {x: 170, y: 120},
    {x: 170, y: 290},
    {x: 380, y: 290},
    {x: 380, y: 165},
    {x: 610, y: 165},
    {x: 610, y: 385},
    {x: 830, y: 385},
    {x: 1000, y: 385}
  ];

  const pads = [
    {x: 90, y: 55}, {x: 255, y: 110}, {x: 280, y: 355}, {x: 450, y: 345},
    {x: 500, y: 100}, {x: 700, y: 210}, {x: 730, y: 455}, {x: 890, y: 285},
    {x: 165, y: 455}, {x: 560, y: 470}
  ];

  const towerDefs = {
    spine: { name: 'Spine Torso', cost: 60, range: 120, fireRate: 0.8, damage: 14, color: '#8bff8c' },
    hydra: { name: 'Hydra Torso', cost: 90, range: 165, fireRate: 0.45, damage: 10, color: '#67d7ff' },
    ultra: { name: 'Ultra Torso', cost: 140, range: 105, fireRate: 1.15, damage: 32, color: '#ff93d2' }
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
    const a = path[seg], b = path[seg + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function makeEnemy(kind) {
    const defs = {
      raider: { hp: 55, speed: 72, reward: 12, color: '#61b7ff' },
      marauder: { hp: 90, speed: 54, reward: 18, color: '#4f84ff' },
      zealot: { hp: 110, speed: 66, reward: 22, color: '#ffd66d' },
      stalker: { hp: 145, speed: 58, reward: 30, color: '#c58cff' },
      colossus: { hp: 360, speed: 34, reward: 80, color: '#ff9a63', boss: true }
    };
    return { kind, ...defs[kind], seg: 0, t: 0, x: path[0].x, y: path[0].y };
  }

  function startWave() {
    if (state.waveQueue.length || state.gameOver) return;
    state.wave += 1;
    const q = [];
    const pushMany = (k, n) => { for (let i = 0; i < n; i++) q.push(k); };
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
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handlePointer(e); }, { passive: false });

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
      const a = path[enemy.seg], b = path[enemy.seg + 1];
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
          x: tower.x, y: tower.y - 18,
          tx: target.x, ty: target.y,
          target, damage: tower.damage,
          speed: 360,
          color: tower.color
        });
        tower.cooldown = tower.fireRate;
      }
    }

    for (const p of state.projectiles) {
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
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
      const x = (i * 137) % W, y = (i * 79) % H;
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

  function drawTower(t) {
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

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < t.level; i++) {
      ctx.fillRect(-14 + i * 8, 34, 5, 5);
    }
    ctx.restore();
  }

  function drawEnemy(e) {
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
      ctx.moveTo(0, -16); ctx.lineTo(14, 0); ctx.lineTo(0, 16); ctx.lineTo(-14, 0); ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = e.color;
      ctx.fillRect(-14, -22, 28, 44);
      ctx.fillStyle = '#fff2cf';
      ctx.fillRect(-6, -28, 12, 8);
    }

    ctx.fillStyle = '#00000088';
    ctx.fillRect(-16, -30, 32, 5);
    ctx.fillStyle = '#6dff76';
    ctx.fillRect(-16, -30, 32 * Math.max(0, e.hp / (e.kind === 'colossus' ? 360 : e.kind === 'stalker' ? 145 : e.kind === 'zealot' ? 110 : e.kind === 'marauder' ? 90 : 55)), 5);
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
