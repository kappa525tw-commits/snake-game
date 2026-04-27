// ══════════════════════════════════════════
//  多人貪食蛇 - client.js
//  支援 PC（鍵盤）與手機（D-Pad + 滑動）
// ══════════════════════════════════════════

// ── 裝置偵測 ──
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);

if (IS_MOBILE) document.body.classList.add('is-mobile');

// ── Canvas ──
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

let GRID_W = 200;
let GRID_H = 150;
let VIEW_W = 40;
let VIEW_H = 30;
let CELL   = 18;

// ── 狀態 ──
let ws         = null;
let myId       = null;
let myNickname = '';
let gameState  = null;
let joined     = false;

// ══════════════════════════════════════════
//  響應式 Canvas 尺寸
// ══════════════════════════════════════════
function resizeCanvas() {
  if (!joined) return;

  if (IS_MOBILE) {
    // 手機：寬度 = 全螢幕寬，高度扣掉 header + hud
    const headerH = document.querySelector('.game-header')?.offsetHeight || 46;
    const dpadH   = document.getElementById('dpad')?.offsetHeight || 120;
    const scoreH  = document.getElementById('mob-scorebar')?.offsetHeight || 28;
    const availW  = window.innerWidth;
    const availH  = window.innerHeight - headerH - dpadH - scoreH - 4;

    const cellByW = Math.floor(availW / VIEW_W);
    const cellByH = Math.floor(availH / VIEW_H);
    CELL = Math.max(8, Math.min(cellByW, cellByH));
  } else {
    // PC：扣掉 header + side panel + padding
    const headerH = document.querySelector('.game-header')?.offsetHeight || 50;
    const sideW   = 202;
    const pad     = 32;
    const availW  = window.innerWidth  - sideW - pad;
    const availH  = window.innerHeight - headerH - pad;

    const cellByW = Math.floor(availW / VIEW_W);
    const cellByH = Math.floor(availH / VIEW_H);
    CELL = Math.max(10, Math.min(cellByW, cellByH));
  }

  canvas.width  = VIEW_W * CELL;
  canvas.height = VIEW_H * CELL;
  if (gameState) render(gameState);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 300));

// ══════════════════════════════════════════
//  大廳邏輯
// ══════════════════════════════════════════
const nicknameInput = document.getElementById('nicknameInput');
const joinBtn       = document.getElementById('joinBtn');
const lobbyErr      = document.getElementById('lobbyErr');

nicknameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinGame(); });
joinBtn.addEventListener('click', joinGame);

function joinGame() {
  const name = nicknameInput.value.trim();
  if (!name) { lobbyErr.textContent = '請輸入暱稱！'; nicknameInput.focus(); return; }
  lobbyErr.textContent = '';
  joinBtn.disabled = true;
  joinBtn.textContent = '連線中...';
  myNickname = name;
  connectWS(name);
}

function connectWS(nickname) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'set_nickname', nickname }));
  });
  ws.addEventListener('close', () => {
    if (!joined) {
      lobbyErr.textContent = '無法連線伺服器，請重試';
      joinBtn.disabled = false;
      joinBtn.textContent = '進入遊戲';
    }
  });
  ws.addEventListener('error', () => {
    lobbyErr.textContent = '連線錯誤';
    joinBtn.disabled = false;
    joinBtn.textContent = '進入遊戲';
  });
  ws.addEventListener('message', onMessage);
}

// ══════════════════════════════════════════
//  音效（Web Audio API）
// ══════════════════════════════════════════
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playBeep(freq = 440, duration = 0.12, type = 'sine', vol = 0.3) {
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + duration);
  } catch(e) {}
}
function playCountBeep(n) {
  if (n === 0) {
    playBeep(440, 0.08, 'square', 0.3);
    setTimeout(() => playBeep(660, 0.08, 'square', 0.3), 80);
    setTimeout(() => playBeep(880, 0.2,  'square', 0.4), 160);
  } else {
    playBeep(220, 0.15, 'square', 0.25);
  }
}
function playStartClick() {
  playBeep(330, 0.06, 'square', 0.2);
  setTimeout(() => playBeep(440, 0.1, 'square', 0.25), 60);
}

// ══════════════════════════════════════════
//  倒數畫面
// ══════════════════════════════════════════
const countdownEl = document.getElementById('countdownOverlay');

function showCountdown(n) {
  if (!countdownEl) return;
  countdownEl.style.display = 'flex';
  const numEl = countdownEl.querySelector('.cd-num');
  if (n === 0) {
    numEl.textContent = 'GO!';
    numEl.style.color      = '#00ff88';
    numEl.style.textShadow = '0 0 60px rgba(0,255,136,0.8)';
    setTimeout(() => { countdownEl.style.display = 'none'; }, 600);
  } else {
    numEl.textContent = n;
    numEl.style.color      = '#ffb800';
    numEl.style.textShadow = '0 0 60px rgba(255,184,0,0.8)';
    numEl.style.animation  = 'none';
    numEl.offsetHeight;
    numEl.style.animation  = 'cdPop 0.5s ease';
  }
}

// ══════════════════════════════════════════
//  WebSocket 訊息
// ══════════════════════════════════════════
function onMessage(event) {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }

  if (msg.type === 'welcome') {
    myId       = msg.id;
    myNickname = msg.nickname || myNickname;

    VIEW_W = IS_MOBILE ? 25 : 40;
    VIEW_H = IS_MOBILE ? 20 : 30;
    GRID_W = msg.gridWidth  || 200;
    GRID_H = msg.gridHeight || 150;

    joined = true;
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display  = 'flex';
    document.getElementById('myBadge').textContent = '🐍 ' + myNickname;

    resizeCanvas();
  }

  if (msg.type === 'countdown') {
    showCountdown(msg.count);
    playCountBeep(msg.count);
  }

  if (msg.type === 'game_state') {
    gameState = msg;
    render(msg);
    updateUI(msg);
    if (IS_MOBILE) updateMobScorebar(msg);
  }
}

// ══════════════════════════════════════════
//  遊戲按鈕
// ══════════════════════════════════════════
document.getElementById('startBtn').addEventListener('click', () => {
  if (!ws) return;
  playStartClick();
  ws.send(JSON.stringify({ type: 'start' }));
});
document.getElementById('restartBtn').addEventListener('click', () => {
  if (!ws) return;
  playStartClick();
  ws.send(JSON.stringify({ type: 'restart' }));
});

// ══════════════════════════════════════════
//  PC 鍵盤控制
// ══════════════════════════════════════════
const keyMap = {
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right',
  W:'up', S:'down', A:'left', D:'right',
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const dir = keyMap[e.key];
  if (dir && ws) { e.preventDefault(); sendDir(dir); }
});

// ══════════════════════════════════════════
//  手機控制：D-Pad 按鈕 + 滑動手勢
// ══════════════════════════════════════════
function sendDir(dir) {
  ws && ws.send(JSON.stringify({ type: 'move', direction: dir }));
}

// D-Pad（防止滾頁、支援長按連發）
let dpadTimer = null;
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const dir = btn.dataset.dir;

  const press = () => {
    btn.classList.add('pressed');
    sendDir(dir);
    dpadTimer = setInterval(() => sendDir(dir), 120);
  };
  const release = () => {
    btn.classList.remove('pressed');
    clearInterval(dpadTimer);
  };

  btn.addEventListener('touchstart', e => { e.preventDefault(); press(); },   { passive: false });
  btn.addEventListener('touchend',   e => { e.preventDefault(); release(); }, { passive: false });
  btn.addEventListener('mousedown',  press);
  btn.addEventListener('mouseup',    release);
  btn.addEventListener('mouseleave', release);
});

// 滑動手勢（canvas 上）
let swipeStart = null;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (!swipeStart) return;
  const dx = e.changedTouches[0].clientX - swipeStart.x;
  const dy = e.changedTouches[0].clientY - swipeStart.y;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // 太短不算
  const dir = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down'  : 'up');
  sendDir(dir);
  swipeStart = null;
}, { passive: false });

// ══════════════════════════════════════════
//  渲染
// ══════════════════════════════════════════
function render(state) {
  let offsetX = 0;
  let offsetY = 0;
  if (myId && state.snakes && state.snakes[myId]) {
    const mySnake = state.snakes[myId];
    if (mySnake.body && mySnake.body.length > 0) {
      offsetX = mySnake.body[0].x - VIEW_W / 2;
      offsetY = mySnake.body[0].y - VIEW_H / 2;
    }
  }

  // 限制 offsetX/offsetY 在地圖邊界內
  offsetX = Math.max(0, Math.min(offsetX, GRID_W - VIEW_W));
  offsetY = Math.max(0, Math.min(offsetY, GRID_H - VIEW_H));

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 格線
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  const startX = Math.max(0, Math.floor(offsetX));
  const endX   = Math.min(GRID_W, Math.ceil(offsetX + VIEW_W));
  const startY = Math.max(0, Math.floor(offsetY));
  const endY   = Math.min(GRID_H, Math.ceil(offsetY + VIEW_H));

  for (let x = startX; x <= endX; x++) {
    const drawX = (x - offsetX) * CELL;
    ctx.beginPath(); ctx.moveTo(drawX, 0); ctx.lineTo(drawX, canvas.height); ctx.stroke();
  }
  for (let y = startY; y <= endY; y++) {
    const drawY = (y - offsetY) * CELL;
    ctx.beginPath(); ctx.moveTo(0, drawY); ctx.lineTo(canvas.width, drawY); ctx.stroke();
  }

  // 食物
  (state.foods || []).forEach(food => {
    if (food.x < offsetX - 1 || food.x > offsetX + VIEW_W + 1 ||
        food.y < offsetY - 1 || food.y > offsetY + VIEW_H + 1) return;

    const cx = (food.x - offsetX) * CELL + CELL/2;
    const cy = (food.y - offsetY) * CELL + CELL/2;
    const r  = food.type === 'special' ? CELL*0.42 : CELL*0.32;
    ctx.shadowColor = food.type === 'special' ? '#FFD700' : food.color;
    ctx.shadowBlur  = food.type === 'special' ? 14 : 6;
    ctx.fillStyle   = food.color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur  = 0;
  });

  // 蛇
  Object.entries(state.snakes || {}).forEach(([pid, snake]) => {
    if (!snake.body || !snake.body.length) return;
    const isMe = pid === myId;

    snake.body.forEach((seg, i) => {
      if (seg.x < offsetX - 1 || seg.x > offsetX + VIEW_W + 1 ||
          seg.y < offsetY - 1 || seg.y > offsetY + VIEW_H + 1) return;

      const x = (seg.x - offsetX) * CELL + 1;
      const y = (seg.y - offsetY) * CELL + 1;
      const w = CELL - 2;
      const h = CELL - 2;
      const alpha = snake.alive ? (1 - i / snake.body.length * 0.45) : 0.2;
      ctx.globalAlpha = alpha;

      if (i === 0) {
        ctx.fillStyle   = snake.color;
        ctx.shadowColor = snake.color;
        ctx.shadowBlur  = snake.alive ? (isMe ? 16 : 8) : 0;
      } else {
        ctx.fillStyle  = adjustColor(snake.color, -40);
        ctx.shadowBlur = 0;
      }

      roundRect(ctx, x, y, w, h, Math.max(2, CELL * 0.2));
      ctx.fill();

      // 眼睛（格子夠大才畫）
      if (i === 0 && snake.alive && CELL >= 10) {
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1;
        const ex = (seg.x - offsetX) * CELL + CELL/2;
        const ey = (seg.y - offsetY) * CELL + CELL/2;
        const er = Math.max(1, CELL * 0.13);
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(ex - er*2, ey - er, er, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + er*2, ey - er, er, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex - er*1.5, ey - er*1.4, er*0.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + er*2.5, ey - er*1.4, er*0.5, 0, Math.PI*2); ctx.fill();
      }
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // 名字標籤（只在 PC 或格子夠大時顯示）
    if (!IS_MOBILE && snake.body.length && snake.alive && CELL >= 14) {
      const head = snake.body[0];
      const name = (state.nicknames && state.nicknames[pid]) || pid.slice(0, 8);
      ctx.font      = `${isMe ? 'bold ' : ''}${Math.max(9, CELL*0.6)}px sans-serif`;
      ctx.fillStyle = snake.color;
      ctx.textAlign = 'center';
      ctx.globalAlpha = isMe ? 1 : 0.8;
      ctx.fillText(name, (head.x - offsetX)*CELL + CELL/2, (head.y - offsetY)*CELL - 2);
      ctx.globalAlpha = 1;
      ctx.textAlign   = 'left';
    }
  });

  // Overlay
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.style.display = state.running ? 'none' : 'flex';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);   ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h);   ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x, y+r);     ctx.arcTo(x,   y,   x+r, y,     r);
  ctx.closePath();
}

function adjustColor(hex, amount) {
  try {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `rgb(${r},${g},${b})`;
  } catch { return hex; }
}

// ══════════════════════════════════════════
//  UI 更新
// ══════════════════════════════════════════
function updateUI(state) {
  const el = document.getElementById('playerCount');
  if (el) el.textContent = Object.keys(state.snakes || {}).length;

  if (IS_MOBILE) return; // 手機用 scorebar 取代

  // PC 排行榜
  const sb = document.getElementById('scoreboard');
  if (sb) {
    const rows = Object.entries(state.snakes || {})
      .map(([pid, s]) => ({
        name: (state.nicknames && state.nicknames[pid]) || pid.slice(0,8),
        score: s.score || 0, alive: s.alive, color: s.color, isMe: pid === myId,
      }))
      .sort((a,b) => b.score - a.score);

    sb.innerHTML = rows.map((r, i) => `
      <div style="display:flex;align-items:center;gap:7px;padding:5px 0;
                  border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;
                  opacity:${r.alive?1:0.35}">
        <span style="color:#333;width:12px;font-size:10px">${i+1}</span>
        <span style="width:7px;height:7px;border-radius:50%;background:${r.color};flex-shrink:0"></span>
        <span style="flex:1;font-weight:${r.isMe?700:400};color:${r.isMe?r.color:'#e0e0f0'}">${escHtml(r.name)}</span>
        <span style="font-weight:700;color:${r.color}">${r.score}</span>
        <span>${r.alive?'':'💀'}</span>
      </div>`).join('');
  }

  // PC 玩家列表
  const pl = document.getElementById('playerList');
  if (pl) {
    pl.innerHTML = Object.entries(state.snakes || {}).map(([pid, s]) => {
      const name  = (state.nicknames && state.nicknames[pid]) || pid.slice(0,8);
      const isMe  = pid === myId;
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05)">
        <span style="width:7px;height:7px;border-radius:50%;background:${s.color}"></span>
        <span style="flex:1;color:${isMe?s.color:'#e0e0f0'};font-weight:${isMe?700:400}">${escHtml(name)}${isMe?' ◀':''}</span>
        <span>${s.alive?'':'💀'}</span>
      </div>`;
    }).join('');
  }

  // 歷史排行榜
  const hb = document.getElementById('historyBoard');
  if (hb && state.top_history) {
    hb.innerHTML = state.top_history.map((r, i) => `
      <div style="display:flex;align-items:center;gap:7px;padding:5px 0;
                  border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">
        <span style="color:#ffb800;width:12px;font-size:10px">${i+1}</span>
        <span style="flex:1;color:#e0e0f0">${escHtml(r.nickname)}</span>
        <span style="font-weight:700;color:#00ff88">${r.score}</span>
      </div>`).join('');
  }
}

// 手機分數條（底部滾動條）
function updateMobScorebar(state) {
  const bar = document.getElementById('mob-scorebar');
  if (!bar) return;
  const rows = Object.entries(state.snakes || {})
    .map(([pid, s]) => ({
      name: (state.nicknames && state.nicknames[pid]) || pid.slice(0,8),
      score: s.score || 0, alive: s.alive, color: s.color, isMe: pid === myId,
    }))
    .sort((a,b) => b.score - a.score);

  bar.innerHTML = rows.map((r, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;opacity:${r.alive?1:0.4}">
      <span style="width:7px;height:7px;border-radius:50%;background:${r.color};flex-shrink:0"></span>
      <span style="font-weight:${r.isMe?700:400};color:${r.isMe?r.color:'#e0e0f0'}">${escHtml(r.name)}</span>
      <span style="color:${r.color};font-weight:700">${r.score}</span>
      ${r.alive?'':'<span>💀</span>'}
    </span>`
  ).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// 初始畫面
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, canvas.width, canvas.height);
