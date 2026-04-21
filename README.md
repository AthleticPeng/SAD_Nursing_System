# Nursing System

React 前端、Express API、PostgreSQL 資料庫與 Docker Compose 的照護系統專案。

## 啟動

```bash
docker compose up --build
```

服務啟動後開啟：

- 前端：http://localhost:5173
- 後端健康檢查：http://localhost:3000/api/health
- 病人資料 API：http://localhost:3000/api/patients

## 停止

```bash
docker compose down
```

若要連資料庫資料一起清掉：

```bash
docker compose down -v
```
