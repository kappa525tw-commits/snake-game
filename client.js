// ══════════════════════════════════════════
//  多人貪食蛇 - client.js
// ══════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

let GRID_W = 40;
let GRID_H = 30;
const CELL = 18;

canvas.width  = GRID_W * CELL;
canvas.height = GRID_H * CELL;

// ── 狀態 ──
let ws          = null;
let myId        = null;
let myNickname  = '';
let gameState   = null;
let joined      = false;

// ══════════════════════════════════════════
//  大廳邏輯
// ══════════════════════════════════════════
const nicknameInput = document.getElementById('nicknameInput');
const joinBtn       = document.getElementById('joinBtn');
const lobbyErr      = document.getElementById('lobbyErr');

// Enter 直接加入
nicknameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinGame();
});
joinBtn.addEventListener('click', joinGame);

function joinGame() {
  const name = nicknameInput.value.trim();
  if (!name) {
    lobbyErr.textContent = '請輸入暱稱！';
    nicknameInput.focus();
    return;
  }
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
    // 連線後立刻送暱稱
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
    lobbyErr.textContent = '連線錯誤，請確認伺服器是否正常運作';
    joinBtn.disabled = false;
    joinBtn.textContent = '進入遊戲';
  });

  ws.addEventListener('message', onMessage);
}

// ══════════════════════════════════════════
//  音效系統（Web Audio API，不需要任何音效檔）
// ══════════════════════════════════════════
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playBeep(freq = 440, duration = 0.12, type = 'sine', vol = 0.4) {
  try {
    const ac  = getAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch(e) {}
}

// 倒數音效（低沉 beep）
function playCountBeep(n) {
  if (n === 0) {
    // GO！— 上升音
    playBeep(440, 0.08, 'square', 0.3);
    setTimeout(() => playBeep(660, 0.08, 'square', 0.3), 80);
    setTimeout(() => playBeep(880, 0.2,  'square', 0.4), 160);
  } else {
    // 倒數 tick
    playBeep(220, 0.15, 'square', 0.25);
  }
}

// 開始按鈕音效
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

  if (n === 0) {
    countdownEl.querySelector('.cd-num').textContent = 'GO!';
    countdownEl.querySelector('.cd-num').style.color = '#00ff88';
    countdownEl.querySelector('.cd-num').style.textShadow = '0 0 60px rgba(0,255,136,0.8)';
    setTimeout(() => { countdownEl.style.display = 'none'; }, 600);
  } else {
    countdownEl.querySelector('.cd-num').textContent = n;
    countdownEl.querySelector('.cd-num').style.color = '#ffb800';
    countdownEl.querySelector('.cd-num').style.textShadow = '0 0 60px rgba(255,184,0,0.8)';
    // 每次數字更新觸發動畫
    const el = countdownEl.querySelector('.cd-num');
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'cdPop 0.5s ease';
  }
}
function onMessage(event) {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }

  if (msg.type === 'welcome') {
    myId       = msg.id;
    myNickname = msg.nickname || myNickname;
    GRID_W     = msg.gridWidth  || 40;
    GRID_H     = msg.gridHeight || 30;
    canvas.width  = GRID_W * CELL;
    canvas.height = GRID_H * CELL;

    // 切換到遊戲畫面
    joined = true;
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display  = 'flex';
    document.getElementById('myBadge').textContent = '🐍 ' + myNickname;
  }

  if (msg.type === 'countdown') {
    showCountdown(msg.count);
    playCountBeep(msg.count);
  }

  if (msg.type === 'game_state') {
    gameState = msg;
    render(msg);
    updateUI(msg);
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
//  鍵盤控制
// ══════════════════════════════════════════
const keyMap = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const dir = keyMap[e.key];
  if (dir && ws) {
    e.preventDefault();
    ws.send(JSON.stringify({ type: 'move', direction: dir }));
  }
});

// ── 手機滑動 ──
let touchStart = null;
canvas.addEventListener('touchstart', e => { touchStart = e.touches[0]; }, { passive: true });
canvas.addEventListener('touchend', e => {
  if (!touchStart || !ws) return;
  const dx = e.changedTouches[0].clientX - touchStart.clientX;
  const dy = e.changedTouches[0].clientY - touchStart.clientY;
  const dir = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down'  : 'up');
  ws.send(JSON.stringify({ type: 'move', direction: dir }));
  touchStart = null;
}, { passive: true });

// ══════════════════════════════════════════
//  渲染
// ══════════════════════════════════════════
function render(state) {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 格線
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath(); ctx.moveTo(x*CELL, 0); ctx.lineTo(x*CELL, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath(); ctx.moveTo(0, y*CELL); ctx.lineTo(canvas.width, y*CELL); ctx.stroke();
  }

  // 食物
  (state.foods || []).forEach(food => {
    const cx = food.x * CELL + CELL/2;
    const cy = food.y * CELL + CELL/2;
    const r  = food.type === 'special' ? CELL*0.42 : CELL*0.32;
    ctx.shadowColor = food.type === 'special' ? '#FFD700' : food.color;
    ctx.shadowBlur  = food.type === 'special' ? 14 : 6;
    ctx.fillStyle   = food.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // 蛇
  Object.entries(state.snakes || {}).forEach(([pid, snake]) => {
    if (!snake.body || !snake.body.length) return;
    const isMe = pid === myId;

    snake.body.forEach((seg, i) => {
      const x = seg.x * CELL + 1;
      const y = seg.y * CELL + 1;
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

      roundRect(ctx, x, y, w, h, 3);
      ctx.fill();

      // 眼睛
      if (i === 0 && snake.alive) {
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1;
        const ex = seg.x * CELL + CELL/2;
        const ey = seg.y * CELL + CELL/2;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(ex-3, ey-2, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex+3, ey-2, 2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex-2.3, ey-2.5, 0.8, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex+3.7, ey-2.5, 0.8, 0, Math.PI*2); ctx.fill();
      }
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // 名字標籤
    if (snake.body.length && snake.alive) {
      const head = snake.body[0];
      const name = (state.nicknames && state.nicknames[pid]) || pid.slice(0, 8);
      ctx.font      = `${isMe ? 'bold ' : ''}10px sans-serif`;
      ctx.fillStyle = snake.color;
      ctx.textAlign = 'center';
      ctx.globalAlpha = isMe ? 1 : 0.8;
      ctx.fillText(name, head.x*CELL + CELL/2, head.y*CELL - 3);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  });

  // Overlay
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.style.display = state.running ? 'none' : 'flex';
  }
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
  const count = Object.keys(state.snakes || {}).length;
  const el = document.getElementById('playerCount');
  if (el) el.textContent = count;

  const gid = document.getElementById('gameId');
  if (gid) gid.textContent = state.gameId || '-';

  // 排行榜
  const sb = document.getElementById('scoreboard');
  if (sb) {
    const rows = Object.entries(state.snakes || {})
      .map(([pid, s]) => ({
        pid,
        name : (state.nicknames && state.nicknames[pid]) || pid.slice(0,8),
        score: s.score || 0,
        alive: s.alive,
        color: s.color,
        isMe : pid === myId,
      }))
      .sort((a,b) => b.score - a.score);

    sb.innerHTML = rows.map((r, i) => `
      <div style="display:flex;align-items:center;gap:7px;opacity:${r.alive?1:0.35}">
        <span style="color:#333;font-size:11px;width:14px">${i+1}</span>
        <span style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0"></span>
        <span style="flex:1;font-weight:${r.isMe?700:400};color:${r.isMe?r.color:'#e0e0f0'}">${escHtml(r.name)}</span>
        <span style="font-weight:700;color:${r.color}">${r.score}</span>
        <span>${r.alive?'':'💀'}</span>
      </div>
    `).join('');
  }

  // 玩家列表
  const pl = document.getElementById('playerList');
  if (pl) {
    pl.innerHTML = Object.entries(state.snakes || {}).map(([pid, s]) => {
      const name = (state.nicknames && state.nicknames[pid]) || pid.slice(0,8);
      const isMe = pid === myId;
      return `<div style="display:flex;align-items:center;gap:6px;">
        <span style="width:7px;height:7px;border-radius:50%;background:${s.color}"></span>
        <span style="color:${isMe?s.color:'#e0e0f0'};font-weight:${isMe?700:400}">${escHtml(name)}${isMe?' ◀':''}</span>
        <span style="margin-left:auto">${s.alive?'':'💀'}</span>
      </div>`;
    }).join('');
  }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// 初始畫面
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, canvas.width, canvas.height);
