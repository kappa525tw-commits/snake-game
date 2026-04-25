#!/usr/bin/env python3
"""
🐍 多人貪食蛇遊戲 - FastAPI + WebSockets
"""
import asyncio
import random
import uuid
import json
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional, Set

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 遊戲狀態
snakes: Dict[str, dict] = {}
foods: List[dict] = []
scores: Dict[str, int] = {}
game_running: bool = False
game_id: int = 0
connected_clients: Dict[str, WebSocket] = {}

# 遊戲參數
GRID_W = 40
GRID_H = 30
CELL_SIZE = 20
TICK_RATE = 0.1  # 100ms

# 顏色配置
COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85929E', '#73C6B6'
]

def init_game() -> int:
    """初始化新遊戲"""
    global game_id, game_running
    game_id += 1
    spawn_food(5)
    scores.clear()
    game_running = True
    return game_id

def spawn_food(count: int = 1) -> None:
    """生成食物"""
    for _ in range(count):
        foods.append({
            "x": random.randint(0, GRID_W - 1),
            "y": random.randint(0, GRID_H - 1),
            "type": "special" if random.random() < 0.1 else "normal",
            "color": "#FFD700" if random.random() < 0.1 else f"hsl({random.randint(0, 359)}, 70%, 60%)"
        })

def create_snake(player_id: str) -> dict:
    """創建蛇"""
    x = random.randint(5, GRID_W - 15)
    y = random.randint(5, GRID_H - 15)
    color = random.choice(COLORS)
    
    return {
        "body": [
            {"x": x, "y": y},
            {"x": x - 1, "y": y},
            {"x": x - 2, "y": y},
            {"x": x - 3, "y": y},
            {"x": x - 4, "y": y}
        ],
        "direction": "right",
        "next_direction": "right",
        "color": color,
        "score": 0,
        "alive": True,
        "player_id": player_id
    }

def move_snake(snake: dict) -> None:
    """移動蛇"""
    if not snake["alive"]:
        return
    
    snake["direction"] = snake["next_direction"]
    head = dict(snake["body"][0])
    
    # 移動方向
    directions = {
        "up": (0, -1),
        "down": (0, 1),
        "left": (-1, 0),
        "right": (1, 0)
    }
    
    dx, dy = directions[snake["direction"]]
    head["x"] += dx
    head["y"] += dy
    
    # 檢查邊界碰撞
    if head["x"] < 0 or head["x"] >= GRID_W or head["y"] < 0 or head["y"] >= GRID_H:
        snake["alive"] = False
        broadcast_game_state()
        return
    
    # 檢查與其他蛇的碰撞
    for pid, s in snakes.items():
        if pid == snake["player_id"]:
            continue
        if not s["alive"]:
            continue
        for segment in s["body"]:
            if head["x"] == segment["x"] and head["y"] == segment["y"]:
                snake["alive"] = False
                broadcast_game_state()
                return
    
    # 檢查與自己的碰撞
    for i in range(1, len(snake["body"])):
        if head["x"] == snake["body"][i]["x"] and head["y"] == snake["body"][i]["y"]:
            snake["alive"] = False
            broadcast_game_state()
            return
    
    # 檢查與食物的碰撞
    ate = False
    remaining_foods = []
    for food in foods:
        if head["x"] == food["x"] and head["y"] == food["y"]:
            ate = True
            snake["score"] += 5 if food["type"] == "special" else 1
            scores[snake["player_id"]] = snake["score"]
        else:
            remaining_foods.append(food)
    
    foods[:] = remaining_foods
    
    if ate:
        spawn_food(1)
    
    # 更新蛇身
    snake["body"].insert(0, head)
    if not ate:
        snake["body"].pop()
    
    broadcast_game_state()

def broadcast_game_state() -> None:
    """廣播遊戲狀態給所有連線玩家"""
    state = {
        "type": "game_state",
        "gameId": game_id,
        "gridWidth": GRID_W,
        "gridHeight": GRID_H,
        "snakes": {pid: {"body": s["body"], "color": s["color"], "alive": s["alive"], "direction": s["direction"], "score": s["score"]} for pid, s in snakes.items()},
        "foods": foods,
        "scores": scores,
        "running": game_running,
        "timestamp": int(datetime.now().timestamp() * 1000)
    }
    
    for client in list(connected_clients.values()):
        try:
            asyncio.create_task(client.send_text(json.dumps(state)))
        except:
            pass

async def game_loop() -> None:
    """遊戲主循環"""
    global game_running
    while True:
        await asyncio.sleep(TICK_RATE)
        if not game_running:
            continue
        
        for snake in list(snakes.values()):
            move_snake(snake)
        
        # 檢查是否所有蛇都死了
        alive_count = sum(1 for s in snakes.values() if s["alive"])
        if alive_count == 0:
            game_running = False
            broadcast_game_state()

async def handle_websocket(websocket: WebSocket) -> None:
    """處理 WebSocket 連線"""
    await websocket.accept()
    
    player_id = f"player_{uuid.uuid4().hex[:8]}"
    snake = create_snake(player_id)
    snakes[player_id] = snake
    scores[player_id] = 0
    connected_clients[player_id] = websocket
    
    # 發送歡迎訊息
    await websocket.send_text(json.dumps({
        "type": "welcome",
        "id": player_id,
        "message": f"歡迎來到貪食蛇！你是 {player_id}"
    }))
    
    # 廣播新玩家加入
    for client in list(connected_clients.values()):
        if client is not websocket:
            try:
                await client.send_text(json.dumps({
                    "type": "player_joined",
                    "id": player_id,
                    "snake": snakes[player_id]
                }))
            except:
                pass
    
    broadcast_game_state()
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "move":
                direction = message.get("direction")
                opposites = {"up": "down", "down": "up", "left": "right", "right": "left"}
                if direction and opposites.get(direction) != snake["direction"] and snake["alive"]:
                    snake["next_direction"] = direction
                    broadcast_game_state()
            
            elif message.get("type") == "restart":
                snake["alive"] = True
                snake["score"] = 0
                snake["body"] = create_snake(player_id)["body"]
                snake["direction"] = "right"
                snake["next_direction"] = "right"
                scores[player_id] = 0
                if not game_running:
                    init_game()
                broadcast_game_state()
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error for {player_id}: {e}")
    finally:
        # 玩家離開
        del snakes[player_id]
        del scores[player_id]
        del connected_clients[player_id]
        
        # 通知其他玩家
        for client in list(connected_clients.values()):
            try:
                await client.send_text(json.dumps({
                    "type": "player_left",
                    "id": player_id
                }))
            except:
                pass
        
        if not snakes:
            game_running = False
            broadcast_game_state()

# 改後
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.get("/")
async def index():
    return FileResponse(os.path.join(BASE_DIR, "client.html"))

@app.get("/client.js")
async def client_js():
    return FileResponse(os.path.join(BASE_DIR, "client.js"))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_websocket(websocket)

# 改後
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(game_loop())

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
