#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT + 1 });

const GRID_W = 40;
const GRID_H = 30;
const CELL_SIZE = 20;
const TICK_RATE = 100;

const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85929E', '#73C6B6'
];

let snakes = {};
let foods = [];
let scores = {};
let gameRunning = false;
let gameId = 0;
let observerClients = new Set();

function initGame() {
  gameId++;
  foods = [];
  spawnFood(5);
  scores = {};
  gameRunning = true;
  return gameId;
}

function spawnFood(count = 1) {
  for (let i = 0; i < count; i++) {
    foods.push({
      x: Math.floor(Math.random() * GRID_W),
      y: Math.floor(Math.random() * GRID_H),
      type: Math.random() < 0.1 ? 'special' : 'normal',
      color: Math.random() < 0.1 ? '#FFD700' : `hsl(${Math.random() * 360}, 70%, 60%)`
    });
  }
}

function createSnake(playerId) {
  const x = Math.floor(Math.random() * (GRID_W - 10)) + 5;
  const y = Math.floor(Math.random() * (GRID_H - 10)) + 5;
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return {
    body: [
      { x, y },
      { x: x - 1, y },
      { x: x - 2, y },
      { x: x - 3, y },
      { x: x - 4, y }
    ],
    direction: 'right',
    nextDirection: 'right',
    color: color,
    score: 0,
    alive: true,
    playerId: playerId
  };
}

function moveSnake(snake) {
  if (!snake.alive) return;
  
  snake.direction = snake.nextDirection;
  
  const head = { ...snake.body[0] };
  
  switch (snake.direction) {
    case 'up':    head.y--; break;
    case 'down':  head.y++; break;
    case 'left':  head.x--; break;
    case 'right': head.x++; break;
  }
  
  // 檢查邊界碰撞
  if (head.x < 0 || head.x >= GRID_W || head.y < 0 || head.y >= GRID_H) {
    snake.alive = false;
    broadcastGameState();
    return;
  }
  
  // 檢查與其他蛇的碰撞
  for (const [pid, s] of Object.entries(snakes)) {
    if (pid === snake.playerId) continue;
    if (!s.alive) continue;
    for (const segment of s.body) {
      if (head.x === segment.x && head.y === segment.y) {
        snake.alive = false;
        broadcastGameState();
        return;
      }
    }
  }
  
  // 檢查與自己的碰撞
  for (let i = 1; i < snake.body.length; i++) {
    if (head.x === snake.body[i].x && head.y === snake.body[i].y) {
      snake.alive = false;
      broadcastGameState();
      return;
    }
  }
  
  // 檢查與食物的碰撞
  let ate = false;
  foods = foods.filter(food => {
    if (head.x === food.x && head.y === food.y) {
      ate = true;
      snake.score += food.type === 'special' ? 5 : 1;
      scores[snake.playerId] = snake.score;
      return false;
    }
    return true;
  });
  
  if (ate) {
    spawnFood(1);
  }
  
  snake.body.unshift(head);
  
  if (!ate) {
    snake.body.pop();
  }
  
  broadcastGameState();
}

function broadcastGameState() {
  const state = {
    type: 'game_state',
    gameId: gameId,
    gridWidth: GRID_W,
    gridHeight: GRID_H,
    snakes: {},
    foods: foods,
    scores: scores,
    running: gameRunning,
    timestamp: Date.now()
  };
  
  for (const [pid, snake] of Object.entries(snakes)) {
    state.snakes[pid] = {
      body: snake.body,
      color: snake.color,
      alive: snake.alive,
      direction: snake.direction,
      score: snake.score
    };
  }
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(state));
    }
  });
}

// 遊戲主循環
setInterval(() => {
  if (!gameRunning) return;
  
  for (const [pid, snake] of Object.entries(snakes)) {
    moveSnake(snake);
  }
  
  // 檢查是否所有蛇都死了
  const aliveCount = Object.values(snakes).filter(s => s.alive).length;
  if (aliveCount === 0) {
    gameRunning = false;
    broadcastGameState();
  }
}, TICK_RATE);

wss.on('connection', (ws) => {
  ws.id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  
  const snake = createSnake(ws.id);
  snakes[ws.id] = snake;
  scores[ws.id] = 0;
  
  // 通知新玩家
  ws.send(JSON.stringify({
    type: 'welcome',
    id: ws.id,
    message: `歡迎來到貪食蛇！你是 ${ws.id}`
  }));
  
  // 通知其他玩家
  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'player_joined',
        id: ws.id,
        snake: snakes[ws.id]
      }));
    }
  });
  
  // 發送當前遊戲狀態
  broadcastGameState();
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'move') {
        const validDirections = ['up', 'down', 'left', 'right'];
        if (validDirections.includes(data.direction)) {
          // 防止反向移動
          const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
          if (snake.alive && data.direction !== opposites[snake.direction]) {
            snake.nextDirection = data.direction;
          }
        }
      } else if (data.type === 'restart') {
        snake.alive = true;
        snake.score = 0;
        snake.body = createSnake(ws.id).body;
        snake.direction = 'right';
        snake.nextDirection = 'right';
        scores[ws.id] = 0;
        if (!gameRunning) {
          initGame();
        }
        broadcastGameState();
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  });
  
  ws.on('close', () => {
    delete snakes[ws.id];
    delete scores[ws.id];
    
    // 通知其他玩家
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'player_left',
          id: ws.id,
          snake: snakes[ws.id]
        }));
      }
    });
    
    // 檢查是否所有玩家都離開
    if (Object.keys(snakes).length === 0) {
      gameRunning = false;
      broadcastGameState();
    }
  });
});

// 創建 HTTP 服務器
const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else if (req.url === '/style.css') {
    fs.readFile(path.join(__dirname, 'style.css'), (err, data) => {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// 啟動服務器
httpServer.listen(PORT, () => {
  console.log(`🐍 多人貪食蛇遊戲在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 伺服器在 ws://localhost:${PORT + 1}`);
  console.log('🫓 打開瀏覽器並多開幾個標籤頁來測試多人遊戲！');
});
