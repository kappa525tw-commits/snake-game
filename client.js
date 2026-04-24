const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerCount = document.getElementById('playerCount');
const gameIdEl = document.getElementById('gameId');
const myIdEl = document.getElementById('myId');
const scoreboardEl = document.getElementById('scoreboard');
const playerListEl = document.getElementById('playerList');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const overlay = document.getElementById('overlay');

// Canvas 設定
canvas.width = 800;
canvas.height = 600;

const GRID_W = 40;
const GRID_H = 30;
const CELL_SIZE = 20;

let ws = null;
let myId = null;
let mySnake = null;
let gameState = null;
let players = {};
let animationId = null;

// 連線
function connect() {
  ws = new WebSocket(`ws://${location.host}:${parseInt(location.port) + 1 || 3001}`);
  
  ws.onopen = () => {
    console.log('Connected!');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleMessage(data);
  };
  
  ws.onclose = () => {
    setTimeout(connect, 3000);
  };
}

function handleMessage(data) {
  if (data.type === 'welcome') {
    myId = data.id;
    myIdEl.textContent = myId;
  } else if (data.type === 'game_state') {
    gameState = data;
    playerCount.textContent = Object.keys(data.snakes).length;
    gameIdEl.textContent = data.gameId;
    players = data.snakes;
    
    // 更新排行榜
    updateScoreboard(data.scores);
    
    // 更新玩家列表
    updatePlayerList(data.snakes);
    
    // 找到我的蛇
    if (data.snakes[myId]) {
      mySnake = data.snakes[myId];
    }
    
    // 隱藏覆蓋層
    overlay.style.display = 'none';
  } else if (data.type === 'player_joined') {
    players[data.id] = data.snake;
    playerCount.textContent = Object.keys(players).length;
    updatePlayerList(players);
  } else if (data.type === 'player_left') {
    delete players[data.id];
    playerCount.textContent = Object.keys(players).length;
    updatePlayerList(players);
  }
}

function updateScoreboard(scores) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  scoreboardEl.innerHTML = sorted.map(([id, score], i) => `
    <div class="player-row ${id === myId ? 'my-score' : ''}">
      <span class="rank">#${i + 1}</span>
      <span class="name">${id === myId ? '🫓 你' : id.substring(7)}</span>
      <span class="score">${score}</span>
    </div>
  `).join('');
}

function updatePlayerList(snakes) {
  playerListEl.innerHTML = Object.entries(snakes).map(([id, snake]) => `
    <div class="player-item" style="border-left: 3px solid ${snake.color}">
      <span>${id === myId ? '🫓 你' : id.substring(7)}</span>
      <span>🟢</span>
    </div>
  `).join('');
}

// 畫遊戲
function draw() {
  if (!gameState) return;
  
  // 背景
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 網格
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, GRID_H * CELL_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(GRID_W * CELL_SIZE, y * CELL_SIZE);
    ctx.stroke();
  }
  
  // 食物
  gameState.foods.forEach(food => {
    ctx.fillStyle = food.color;
    ctx.beginPath();
    ctx.arc(food.x * CELL_SIZE + CELL_SIZE/2, food.y * CELL_SIZE + CELL_SIZE/2, CELL_SIZE/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    
    if (food.type === 'special') {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FFD700';
    }
  });
  ctx.shadowBlur = 0;
  
  // 蛇
  Object.entries(players).forEach(([id, snake]) => {
    if (!snake.alive) {
      ctx.fillStyle = 'rgba(100,100,100,0.3)';
      snake.body.forEach((segment, i) => {
        ctx.fillRect(segment.x * CELL_SIZE, segment.y * CELL_SIZE, CELL_SIZE - 2, CELL_SIZE - 2);
      });
      return;
    }
    
    // 蛇身
    snake.body.forEach((segment, i) => {
      const alpha = 1 - (i / snake.body.length) * 0.5;
      ctx.fillStyle = i === 0 ? snake.color : snake.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.fillRect(segment.x * CELL_SIZE, segment.y * CELL_SIZE, CELL_SIZE - 2, CELL_SIZE - 2);
      
      // 眼睛
      if (i === 0) {
        ctx.fillStyle = '#fff';
        const eyeSize = 3;
        if (snake.direction === 'right') {
          ctx.fillRect(segment.x * CELL_SIZE + 12, segment.y * CELL_SIZE + 4, eyeSize, eyeSize);
          ctx.fillRect(segment.x * CELL_SIZE + 12, segment.y * CELL_SIZE + 12, eyeSize, eyeSize);
        } else if (snake.direction === 'left') {
          ctx.fillRect(segment.x * CELL_SIZE + 4, segment.y * CELL_SIZE + 4, eyeSize, eyeSize);
          ctx.fillRect(segment.x * CELL_SIZE + 4, segment.y * CELL_SIZE + 12, eyeSize, eyeSize);
        } else if (snake.direction === 'up') {
          ctx.fillRect(segment.x * CELL_SIZE + 4, segment.y * CELL_SIZE + 4, eyeSize, eyeSize);
          ctx.fillRect(segment.x * CELL_SIZE + 12, segment.y * CELL_SIZE + 4, eyeSize, eyeSize);
        } else {
          ctx.fillRect(segment.x * CELL_SIZE + 4, segment.y * CELL_SIZE + 12, eyeSize, eyeSize);
          ctx.fillRect(segment.x * CELL_SIZE + 12, segment.y * CELL_SIZE + 12, eyeSize, eyeSize);
        }
      }
    });
  });
  
  animationId = requestAnimationFrame(draw);
}

// 控制
document.addEventListener('keydown', (e) => {
  if (!ws || !myId) return;
  
  const directions = {
    'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
    'w': 'up', 's': 'down', 'a': 'left', 'd': 'right',
    'W': 'up', 'S': 'down', 'A': 'left', 'D': 'right'
  };
  
  const dir = directions[e.key];
  if (dir) {
    e.preventDefault();
    ws.send(JSON.stringify({ type: 'move', direction: dir }));
  }
});

startBtn.addEventListener('click', () => {
  if (ws) ws.send(JSON.stringify({ type: 'restart' }));
});

restartBtn.addEventListener('click', () => {
  if (ws) ws.send(JSON.stringify({ type: 'restart' }));
});

// 啟動
connect();
draw();
