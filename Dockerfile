FROM python:3.11-slim

WORKDIR /app

# 安裝依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製程式碼
COPY . .

# Render 指定端口
ENV PORT=10000

# 暴露端口
EXPOSE 10000

# 啟動應用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
