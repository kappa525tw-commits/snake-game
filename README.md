# 多人貪食蛇遊戲 🐍

用 Python FastAPI + WebSocket 編寫的多人連線貪食蛇遊戲。

## 功能

- ✅ 多人同時連線（WebSocket 即時通訊）
- ✅ 排行榜
- ✅ 食物系統（普通 + 稀有）
- ✅ 碰撞檢測
- ✅ 自動重生

## 快速開始

### 開發環境

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

瀏覽器打開 http://localhost:8000

### Docker

```bash
docker build -t snake-game .
docker run -p 8000:8000 snake-game
```

## 技術棧

- **後端**: Python 3.11 + FastAPI + websockets
- **前端**: HTML5 Canvas + JavaScript + WebSocket
- **部署**: Render / Docker

## ⚠️ 安全提醒

如果你之前有在 GitHub 使用 Personal Access Token，請去 GitHub Settings → Developer settings → Personal access tokens 把該 token **Revoke/Delete**！
