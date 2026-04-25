// ══════════════════════════════════════════
//  多人貪食蛇 - client.js
// ══════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── WebSocket：自動偵測 ws / wss，不寫死 localhost ──
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}/ws`);

// ── 狀態 ──
let myId = null;
let myNickname = '';
let gameState = null;
let GRID_W = 40;
let GRID_H = 30;
const CELL = 18;

canvas.width  = GRID_W * CELL;
canvas.height = GRID_H * CELL;

// ── 按鈕事件 ──
document.getElementById('startBtn').addEventListener('click', () => {
  ws.send(JSON.stringify({ type: 'start' }));
});

document.getElementById('restartBtn').addEventListener('click', () => {
  ws.send(JSON.stringify({ type: 'restart' }));
});

// ── 鍵盤控制 ──
const keyMap = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

document.addEventListener('keydown', (e) => {
  const dir = keyMap[e.key];
  if (dir) {
    e.preventDefault();
    ws.send(JSON.stringify({ type: 'move', direction: dir }));
  }
});

// ── 手機滑動控制 ──
let touchStart = null;
canvas.addEventListener('touchstart', e => { touchStart = e.touches[0]; }, { passive: true });
canvas.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.clientX;
  const dy = e.changedTouches[0].clientY - touchStart.clientY;
  let dir;
  if (Math.abs(dx) > Math.abs(dy)) {
    dir = dx > 0 ? 'right' : 'left';
  } else {
    dir = dy > 0 ? 'down' : 'up';
  }
  ws.send(JSON.stringify({ type: 'move', direction: dir }));
  touchStart = null;
}, { passive: true });

// ══════════════════════════════════════════
//  WebSocket 事件
// ══════════════════════════════════════════
ws.addEventListener('open', () => {
  console.log('✅ WebSocket 連線成功');
  setStatus('已連線，等待開始...');
});

ws.addEventListener('close', () => {
  console.warn('❌ WebSocket 斷線');
  setStatus('連線中斷，請重新整理頁面');
});

ws.addEventListener('error', (e) => {
  console.error('WebSocket 錯誤', e);
  setStatus('連線錯誤');
});

ws.addEventListener('message', (event) => {
  let msg;
  try { msg = JSON.parse(event.data); } catch { return; }

  if (msg.type === 'welcome') {
    myId = msg.id;
    myNickname = msg.nickname;
    GRID_W = msg.gridWidth  || 40;
    GRID_H = msg.gridHeight || 30;
    canvas.width  = GRID_W * CELL;
    canvas.height = GRID_H * CELL;
    document.getElementById('myId').textContent = myNickname;
    setStatus('已連線！按「開始遊戲」');
  }

  if (msg.type === 'game_state') {
    gameState = msg;
    render(msg);
    updateUI(msg);
  }
});

// ══════════════════════════════════════════
//  渲染
// ══════════════════════════════════════════
function render(state) {
  // 背景
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 格線
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(canvas.width,y*CELL); ctx.stroke();
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
        // 頭
        ctx.fillStyle = snake.color;
        ctx.shadowColor = snake.color;
        ctx.shadowBlur  = snake.alive ? (isMe ? 16 : 8) : 0;
      } else {
        ctx.fillStyle = adjustColor(snake.color, -40);
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
      const name = (state.nicknames && state.nicknames[pid]) || pid.slice(0,8);
      ctx.font      = `bold 10px sans-serif`;
      ctx.fillStyle = snake.color;
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.9;
      ctx.fillText(name, head.x*CELL + CELL/2, head.y*CELL - 3);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  });

  // Overlay：遊戲未開始
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.style.display = state.running ? 'none' : 'flex';
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x,   y,   x+r, y,     r);
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
  // 玩家數
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
        name: (state.nicknames && state.nicknames[pid]) || pid.slice(0,8),
        score: s.score || 0,
        alive: s.alive,
        color: s.color,
        isMe: pid === myId,
      }))
      .sort((a,b) => b.score - a.score);

    sb.innerHTML = rows.map((r, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;
                  border-bottom:1px solid rgba(255,255,255,0.07);
                  opacity:${r.alive?1:0.4};">
        <span style="color:#888;font-size:12px;width:16px">${i+1}</span>
        <span style="width:10px;height:10px;border-radius:50%;background:${r.color};flex-shrink:0"></span>
        <span style="flex:1;font-size:13px;font-weight:${r.isMe?700:400}">${escHtml(r.name)}${r.isMe?' (你)':''}</span>
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
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;">
        <span style="width:8px;height:8px;border-radius:50%;background:${s.color}"></span>
        <span style="font-size:12px">${escHtml(name)}${pid===myId?' ◀ 你':''}</span>
      </div>`;
    }).join('');
  }
}

function setStatus(msg) {
  const el = document.getElementById('myId');
  if (el && !myId) el.textContent = msg;
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
ctx.fillStyle = 'rgba(255,255,255,0.3)';
ctx.font = '16px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('連線中...', canvas.width/2, canvas.height/2);
ctx.textAlign = 'left';
