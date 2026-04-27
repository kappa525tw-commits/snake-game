#!/usr/bin/env python3
"""
🐍 多人貪食蛇遊戲 - FastAPI + WebSockets
"""

import asyncio
import random
import uuid
import json
import os
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List
import redis.asyncio as redis_async

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
try:
    redis_client = redis_async.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    redis_client = None
    print(f"Redis initialization error: {e}")

top_history_cache = []

async def fetch_top_history():
    global top_history_cache
    if not redis_client: return
    try:
        res = await redis_client.zrevrange("snake_top_scores", 0, 9, withscores=True)
        top_history_cache = [{"nickname": k, "score": int(v)} for k, v in res]
    except Exception as e:
        print(f"Redis fetch error: {e}")

async def update_top_history(nickname: str, score: int):
    if score <= 0 or not redis_client: return
    try:
        current = await redis_client.zscore("snake_top_scores", nickname)
        if current is None or score > float(current):
            await redis_client.zadd("snake_top_scores", {nickname: score})
        await fetch_top_history()
    except Exception as e:
        print(f"Redis update error: {e}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ══════════════════════════════════════════
#  遊戲狀態
# ══════════════════════════════════════════
snakes: Dict[str, dict] = {}
foods: List[dict] = []
scores: Dict[str, int] = {}
nicknames: Dict[str, str] = {}
game_running: bool = False
game_id: int = 0
connected_clients: Dict[str, WebSocket] = {}

# ══════════════════════════════════════════
#  遊戲參數
# ══════════════════════════════════════════
GRID_W = 200
GRID_H = 150
TICK_RATE = 0.12  # 120ms per tick

COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85929E', '#73C6B6'
]

# ══════════════════════════════════════════
#  STARTUP — 啟動遊戲循環
# ══════════════════════════════════════════
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(fetch_top_history())
    asyncio.create_task(game_loop())

# ══════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════
@app.get("/")
async def index():
    path = os.path.join(BASE_DIR, "client.html")
    if os.path.exists(path):
        return FileResponse(path)
    return HTMLResponse("<h1>找不到 client.html</h1>", status_code=404)

@app.get("/client.js")
async def client_js():
    path = os.path.join(BASE_DIR, "client.js")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/javascript")
    return HTMLResponse("// client.js not found", status_code=404)

@app.get("/style.css")
async def style_css():
    path = os.path.join(BASE_DIR, "style.css")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/css")
    # 回傳空 CSS 避免 404 報錯
    return HTMLResponse("/* style.css not found */", status_code=200, media_type="text/css")

# ══════════════════════════════════════════
#  GAME LOGIC
# ══════════════════════════════════════════
def spawn_food(count: int = 1):
    occupied = set()
    for s in snakes.values():
        for seg in s["body"]:
            occupied.add((seg["x"], seg["y"]))
    for f in foods:
        occupied.add((f["x"], f["y"]))

    for _ in range(count):
        tries = 0
        while tries < 200:
            x = random.randint(0, GRID_W - 1)
            y = random.randint(0, GRID_H - 1)
            if (x, y) not in occupied:
                is_special = random.random() < 0.1
                foods.append({
                    "x": x, "y": y,
                    "type": "special" if is_special else "normal",
                    "color": "#FFD700" if is_special else f"hsl({random.randint(0,359)},70%,60%)"
                })
                occupied.add((x, y))
                break
            tries += 1

def create_snake(player_id: str) -> dict:
    x = random.randint(5, GRID_W - 10)
    y = random.randint(5, GRID_H - 10)
    color = random.choice(COLORS)
    return {
        "body": [
            {"x": x,   "y": y},
            {"x": x-1, "y": y},
            {"x": x-2, "y": y},
            {"x": x-3, "y": y},
            {"x": x-4, "y": y},
        ],
        "direction": "right",
        "next_direction": "right",
        "color": color,
        "score": 0,
        "alive": True,
        "player_id": player_id,
    }

def move_snake(snake: dict):
    if not snake["alive"]:
        return

    # 防止反向
    opposites = {"up": "down", "down": "up", "left": "right", "right": "left"}
    if opposites.get(snake["next_direction"]) != snake["direction"]:
        snake["direction"] = snake["next_direction"]

    head = dict(snake["body"][0])
    deltas = {"up": (0,-1), "down": (0,1), "left": (-1,0), "right": (1,0)}
    dx, dy = deltas[snake["direction"]]
    head["x"] += dx
    head["y"] += dy

    # 邊界碰撞（死亡）
    if head["x"] < 0 or head["x"] >= GRID_W or head["y"] < 0 or head["y"] >= GRID_H:
        snake["alive"] = False
        return

    # 撞其他蛇身體
    for pid, s in snakes.items():
        if pid == snake["player_id"] or not s["alive"]:
            continue
        for seg in s["body"]:
            if head["x"] == seg["x"] and head["y"] == seg["y"]:
                snake["alive"] = False
                return

    # 撞自己（排除尾巴，它即將移走）
    for seg in snake["body"][:-1]:
        if head["x"] == seg["x"] and head["y"] == seg["y"]:
            snake["alive"] = False
            return

    # 吃食物
    ate = False
    remaining = []
    for food in foods:
        if head["x"] == food["x"] and head["y"] == food["y"]:
            ate = True
            pts = 5 if food["type"] == "special" else 1
            snake["score"] += pts
            scores[snake["player_id"]] = snake["score"]
        else:
            remaining.append(food)
    foods[:] = remaining

    if ate:
        spawn_food(1)

    snake["body"].insert(0, head)
    if not ate:
        snake["body"].pop()

async def run_countdown():
    """倒數 5 秒後才真正開始遊戲"""
    global game_running
    for i in range(5, 0, -1):
        msg = json.dumps({"type": "countdown", "count": i})
        for client in list(connected_clients.values()):
            try:
                await client.send_text(msg)
            except Exception:
                pass
        await asyncio.sleep(1)
    # 倒數結束，正式開始
    game_running = True
    go_msg = json.dumps({"type": "countdown", "count": 0})
    for client in list(connected_clients.values()):
        try:
            await client.send_text(go_msg)
        except Exception:
            pass
    await broadcast_game_state()

async def broadcast_game_state():
    if not connected_clients:
        return

    state = {
        "type": "game_state",
        "gameId": game_id,
        "gridWidth": GRID_W,
        "gridHeight": GRID_H,
        "snakes": {
            pid: {
                "body": s["body"],
                "color": s["color"],
                "alive": s["alive"],
                "direction": s["direction"],
                "score": s["score"],
                "nickname": nicknames.get(pid, pid),
            }
            for pid, s in snakes.items()
        },
        "foods": foods,
        "scores": scores,
        "nicknames": nicknames,
        "running": game_running,
        "timestamp": int(datetime.now().timestamp() * 1000),
        "top_history": top_history_cache,
    }

    msg = json.dumps(state)
    dead_clients = []
    for pid, client in list(connected_clients.items()):
        try:
            await client.send_text(msg)
        except Exception:
            dead_clients.append(pid)

    for pid in dead_clients:
        connected_clients.pop(pid, None)

async def game_loop():
    global game_running, game_id
    while True:
        await asyncio.sleep(TICK_RATE)
        if not game_running or not snakes:
            continue

        for snake in list(snakes.values()):
            was_alive = snake["alive"]
            move_snake(snake)
            if was_alive and not snake["alive"]:
                asyncio.create_task(update_top_history(nicknames.get(snake["player_id"], snake["player_id"]), snake["score"]))

        await broadcast_game_state()

        # 所有蛇都死了
        alive = [s for s in snakes.values() if s["alive"]]
        if not alive and snakes:
            game_running = False
            await broadcast_game_state()

# ══════════════════════════════════════════
#  WEBSOCKET
# ══════════════════════════════════════════
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global game_running, game_id

    await websocket.accept()
    player_id = f"player_{uuid.uuid4().hex[:8]}"

    snake = create_snake(player_id)
    snakes[player_id] = snake
    scores[player_id] = 0
    nicknames[player_id] = f"玩家{len(snakes)}"
    connected_clients[player_id] = websocket

    # 如果是第一個玩家，初始化遊戲
    if len(snakes) == 1:
        foods.clear()
        spawn_food(6)
        game_id += 1

    # 發送歡迎訊息
    await websocket.send_text(json.dumps({
        "type": "welcome",
        "id": player_id,
        "nickname": nicknames[player_id],
        "gridWidth": GRID_W,
        "gridHeight": GRID_H,
    }))

    await broadcast_game_state()

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except Exception:
                continue

            msg_type = message.get("type")

            if msg_type == "move":
                direction = message.get("direction")
                valid = {"up", "down", "left", "right"}
                if direction in valid and snake["alive"]:
                    snake["next_direction"] = direction

            elif msg_type == "start":
                if not game_running:
                    # 重置所有蛇，但先不開始跑
                    for pid, s in snakes.items():
                        new_snake = create_snake(pid)
                        s.update(new_snake)
                        scores[pid] = 0
                    foods.clear()
                    spawn_food(6)
                    game_id += 1
                    # 廣播倒數開始
                    asyncio.create_task(run_countdown())

            elif msg_type == "restart":
                snake["alive"] = True
                snake["score"] = 0
                new = create_snake(player_id)
                snake["body"] = new["body"]
                snake["direction"] = new["direction"]
                snake["next_direction"] = new["next_direction"]
                scores[player_id] = 0
                if not game_running:
                    game_running = True
                    game_id += 1
                await broadcast_game_state()

            elif msg_type == "set_nickname":
                name = str(message.get("nickname", "")).strip()[:12]
                if name:
                    nicknames[player_id] = name
                await broadcast_game_state()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS error [{player_id}]: {e}")
    finally:
        snakes.pop(player_id, None)
        scores.pop(player_id, None)
        nicknames.pop(player_id, None)
        connected_clients.pop(player_id, None)

        if not snakes:
            game_running = False
            foods.clear()
        else:
            await broadcast_game_state()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
