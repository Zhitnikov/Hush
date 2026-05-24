# Архитектура Hush

## Обзор

```mermaid
flowchart LR
  subgraph client [Browser Client]
    React[React + Vite]
    Zustand[Zustand Stores]
    Crypto[Web Crypto E2EE]
    IDB[IndexedDB keys + media]
    SocketC[Socket.IO Client]
  end
  subgraph server [Node Server]
    Routes[Express Routes]
    DTO[DTO Layer]
    Services[Services Layer]
    SocketS[Socket.IO Handlers]
    Mongo[(MongoDB)]
    Uploads[uploads legacy]
  end
  React --> Routes
  SocketC --> SocketS
  Routes --> DTO
  Routes --> Services
  SocketS --> Services
  DTO --> Services
  Services --> Mongo
  Routes --> Uploads
```

## Слои backend

| Путь | Назначение |
|------|------------|
| `server/server.js` | Bootstrap: helmet, CORS, health, webrtc config, routes |
| `server/routes/` | Тонкий HTTP-слой: валидация входа, вызов services, `next(err)` |
| `server/dto/` | Формирование ответов API (`userDto`, `messageDto`, `channelDto`) |
| `server/services/` | Бизнес-логика: `authService`, `chatService`, `channelService`, `userPrefsService`, `messageService`, `tokenService`, `configService` |
| `server/socket/handlers/` | Realtime: presence, messages, calls, mediaRelay |
| `server/middleware/` | JWT, rate limit, channel ACL, errorHandler |
| `server/models/` | Mongoose-схемы |
| `server/config/constants.js` | Лимиты, роли, STUN по умолчанию, префикс `local://` |
| `server/utils/` | logger, pagination, socketRoom, fileSecurity, SSRF, sanitize |

## Слои frontend

| Путь | Назначение |
|------|------------|
| `client/src/components/` | UI: Auth, Sidebar, ChatWindow, CallInterface, SettingsModal, баннеры |
| `client/src/stores/` | Zustand: `appStore`, `sidebarStore`, `chatWindowStore` |
| `client/src/utils/` | crypto, apiClient, local media (IndexedDB + socket relay), webrtcCall |

## Поток текстового сообщения (личный чат)

```mermaid
sequenceDiagram
  participant C as Client A
  participant S as Server
  participant D as Client B
  C->>C: encryptMessage RSA/AES
  C->>S: send_message JWT socket
  S->>S: sanitize + save ciphertext
  S->>D: receive_message
  D->>D: decryptMessage private key
```

## Поток медиа (E2E, без диска сервера)

```mermaid
sequenceDiagram
  participant A as Sender
  participant S as Socket.IO
  participant B as Receiver
  A->>A: encrypt blob mediaCrypto
  A->>S: media_transfer_start/chunk/end
  S->>B: relay same events
  B->>B: IndexedDB localMediaStore
  A->>S: send_message fileUrl local://id
  S->>B: receive_message metadata only
```

Подробности: [LOCAL_MEDIA.md](LOCAL_MEDIA.md).

## Поток звонка

```mermaid
sequenceDiagram
  participant A as Caller
  participant S as Socket.IO
  participant B as Callee
  A->>S: call_user offer
  S->>B: incoming_call
  B->>S: answer_call
  S->>A: call_answered
  A->>S: webrtc_signal ICE
  S->>B: webrtc_signal
```

## Масштабирование (не реализовано)

- Redis adapter для Socket.IO при нескольких инстансах
- Очередь jobs (Bull/Redis) вместо `setInterval` для scheduled/expire
- TURN как отдельный сервис для WebRTC за symmetric NAT
