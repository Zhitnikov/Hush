# Hush

Веб-мессенджер: E2E-текст, локальное E2E-медиа, Socket.IO, группы, WebRTC-звонки.

## Разработка

Не смешивайте `npm run dev` в `server/` и Docker backend — порт **5000** занят одним процессом.

```powershell
docker compose up -d mongo
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

| Порт | Назначение |
|------|------------|
| **3333** | HTTP dev (LAN без E2E на IP) |
| **3443** | HTTPS dev (звонки, WebRTC, E2E на телефоне) |
| **5000** | Express + Socket.IO |

Телефон в Wi‑Fi: `https://<IP-ПК>:3443` — принять self-signed сертификат.

Из интернета: `npm run dev:public` (loca.lt). Справка: http://localhost:3333/lt-go.html

Vite проксирует `/api`, `/socket.io`, `/uploads` → `127.0.0.1:5000`.

## Docker (всё в контейнерах)

```powershell
docker compose up --build -d
```

UI: http://localhost:3333 — не запускайте `npm run dev` в `server/` параллельно.

## Документация

| Файл | Содержание |
|------|------------|
| [README2.md](README2.md) | Полный справочник по коду и API |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Слои, диаграммы |
| [docs/SECURITY.md](docs/SECURITY.md) | Угрозы, E2E, prod |

## Стек

**Backend:** Express, Socket.IO, Mongoose, слои routes → services → dto, Helmet, rate-limit  

**Frontend:** React 18, Vite, Zustand, IndexedDB  

## Переменные

`server/.env.example`, `client/.env.example` — в dev `VITE_API_ORIGIN` не обязателен.
