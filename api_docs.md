# 🎯 API Documentation - Tebak Angka Multiplayer Game

## 📖 Gambaran Umum
Aplikasi web multiplayer real-time untuk permainan tebak angka dengan bantuan AI hint menggunakan Google Generative AI (Gemini). Aplikasi ini terdiri dari client (React + Vite) dan server (Node.js + Socket.io).

## 🏗️ Arsitektur Aplikasi

### Client (Frontend)
- **Framework**: React + Vite
- **Port**: 5173 (development)
- **Dependencies Utama**:
  - `react`: ^19.1.0
  - `react-dom`: ^19.1.0
  - `react-router`: ^7.6.1
  - `socket.io-client`: ^4.8.1

### Server (Backend)
- **Framework**: Node.js + Express
- **Port**: 3001 (default)
- **Dependencies Utama**:
  - `express`: ^4.21.2
  - `socket.io`: ^4.8.1
  - `@google/generative-ai`: ^0.24.1
  - `cors`: ^2.8.5
  - `dotenv`: ^16.5.0

## 🔗 Socket.io Events API

### 📤 Client → Server Events

#### 1. `joinGame`
**Deskripsi**: Player bergabung ke dalam game
```javascript
socket.emit("joinGame", playerName);
```
- **Parameter**: `playerName` (string) - Nama player
- **Proses**: 
  - Membuat atau mencari waiting room
  - Menambahkan player ke room
  - Player pertama menjadi room master

#### 2. `startGame`
**Deskripsi**: Room master memulai permainan
```javascript
socket.emit("startGame");
```
- **Requirement**: Minimal 2 player di room
- **Akses**: Hanya room master yang dapat memulai game

#### 3. `makeGuess`
**Deskripsi**: Player menebak angka
```javascript
socket.emit("makeGuess", guess);
```
- **Parameter**: `guess` (number) - Tebakan angka (1-100)
- **Logic**: 
  - Satu tebakan per player per round
  - Jika benar: player mendapat poin dan menjadi pemenang round
  - Jika salah: player menunggu hingga round selesai

#### 4. `requestHint`
**Deskripsi**: Player meminta hint dari AI
```javascript
socket.emit("requestHint");
```
- **AI Provider**: Google Generative AI (Gemini-1.5-flash)
- **Response**: Hint kreatif dan lucu sesuai konteks remaja

#### 5. `disconnect`
**Deskripsi**: Player keluar dari game
- **Automatic handling**
- **Logic**:
  - Jika room master keluar: player berikutnya menjadi room master
  - Jika hanya 1 player tersisa: player tersebut menang
  - Jika tidak ada player: room dihapus

### 📥 Server → Client Events

#### 1. `joinedRoom`
**Deskripsi**: Konfirmasi player berhasil bergabung
```javascript
{
  roomId: "room_1234567890",
  isRoomMaster: true/false,
  players: [
    {id: "socket_id", name: "Player Name"}
  ]
}
```

#### 2. `playerJoined`
**Deskripsi**: Notifikasi player lain bergabung
```javascript
{
  player: {id: "socket_id", name: "Player Name"},
  players: [/* array semua players */]
}
```

#### 3. `gameStarted`
**Deskripsi**: Game dimulai
```javascript
{
  round: 1,
  totalRounds: 3
}
```

#### 4. `roundStarted`
**Deskripsi**: Round baru dimulai
```javascript
{
  round: 1,
  timeLeft: 25,
  message: "Semua player bisa menebak sekarang!"
}
```

#### 5. `timerUpdate`
**Deskripsi**: Update countdown timer
```javascript
{
  timeLeft: 24 // detik tersisa
}
```

#### 6. `correctGuess`
**Deskripsi**: Player menebak dengan benar
```javascript
{
  playerId: "socket_id",
  playerName: "Player Name",
  targetNumber: 42,
  guess: 42
}
```

#### 7. `wrongGuess`
**Deskripsi**: Player menebak salah (hanya dikirim ke player yang menebak)
```javascript
{
  playerId: "socket_id",
  playerName: "Player Name",
  guess: 30,
  targetNumber: 42
}
```

#### 8. `playerGuessed`
**Deskripsi**: Notifikasi player sudah menebak (tanpa detail tebakan)
```javascript
{
  playerId: "socket_id",
  playerName: "Player Name",
  hasGuessed: true
}
```

#### 9. `allPlayersGuessed`
**Deskripsi**: Semua player sudah menebak tapi tidak ada yang benar
```javascript
{
  message: "Semua player sudah menebak! Lanjut ke round berikutnya...",
  targetNumber: 42
}
```

#### 10. `playersTimeout`
**Deskripsi**: Waktu habis, beberapa player belum menebak
```javascript
{
  players: ["Player1", "Player2"], // nama players yang timeout
  targetNumber: 42
}
```

#### 11. `roundEnd`
**Deskripsi**: Round berakhir
```javascript
{
  round: 1,
  scores: {
    "socket_id1": 1,
    "socket_id2": 0
  },
  winner: "socket_id1" // atau null
}
```

#### 12. `gameEnd`
**Deskripsi**: Game berakhir (dikirim secara personal ke setiap player)
```javascript
{
  result: {
    type: "winner" | "lose" | "tie" | "draw",
    message: "Selamat! Anda Menang!"
  },
  finalScores: {
    "socket_id1": 2,
    "socket_id2": 1
  }
}
```

#### 13. `aiHint`
**Deskripsi**: Hint dari AI
```javascript
"Nilai yang bikin guru bilang: 'Kamu bisa lebih baik dari ini loh!'"
```

#### 14. `playerLeft`
**Deskripsi**: Player keluar dari room
```javascript
{
  player: {id: "socket_id", name: "Player Name"},
  players: [/* remaining players */],
  wasRoomMaster: true/false
}
```

#### 15. `roomMasterChanged`
**Deskripsi**: Room master berganti
```javascript
{
  newRoomMaster: {id: "socket_id", name: "Player Name"},
  message: "Player Name sekarang menjadi room master"
}
```

## 🎮 Game Flow

### 1. Menu Phase
- Player memasukkan nama
- Emit `joinGame` dengan nama player
- Receive `joinedRoom` dengan info room

### 2. Waiting Room Phase
- Menunggu player lain bergabung (maksimal 4 player)
- Room master dapat memulai game jika minimal 2 player
- Emit `startGame` (hanya room master)

### 3. Playing Phase
- **Game Settings**:
  - 3 rounds per game
  - 25 detik per round
  - Target angka: 1-100 (random)
  - 1 tebakan per player per round

- **Round Flow**:
  1. Server generate target number
  2. Emit `roundStarted` ke semua player
  3. Timer countdown dimulai (emit `timerUpdate` setiap detik)
  4. Player emit `makeGuess`
  5. Jika benar: emit `correctGuess`, round berakhir
  6. Jika salah: emit `wrongGuess` (private), `playerGuessed` (public)
  7. Jika semua player menebak: emit `allPlayersGuessed`
  8. Jika timeout: emit `playersTimeout`
  9. Emit `roundEnd` dan lanjut ke round berikutnya

### 4. Finished Phase
- Emit `gameEnd` dengan hasil personal untuk setiap player
- Tampilkan final scores
- Option untuk bermain lagi

## 🤖 AI Integration

### Google Generative AI
- **Model**: gemini-1.5-flash
- **Function**: `getAIHint()`
- **Prompt Engineering**: 
  - Target audience: 10-20 tahun
  - Style: Lucu, kreatif, familiar
  - Context: Pop culture, kehidupan sekolah, gaming
  - Length: 1-2 kalimat maksimal

### Contoh AI Hints:
```
Angka = 78 → "Nilai yang bikin guru bilang: 'Kamu bisa lebih baik dari ini loh!'"
Angka = 45 → "Tahun yang sering banget muncul pas upacara bendera atau pelajaran PKN."
Angka = 100 → "Nilai yang bikin kamu langsung screenshot nilai buat dipamer ke grup kelas!"
```

## 🔧 Environment Variables

### Server (.env)
```
GOOGLE_API_KEY=your_google_ai_api_key
PORT=3001
```

## 🚀 Setup & Running

### Server
```bash
cd server
npm install
npm start
# atau npm run dev untuk development
```

### Client
```bash
cd client/group-project
npm install
npm run dev
```

## 📱 Client Pages & Routes

### 1. MenuPage (`/`)
- **States**: `menu`, `waiting`
- **Components**: Input nama, join game button, player list, start game button

### 2. GamePage (`/playing`)
- **State**: `playing`
- **Components**: Round info, timer, scores, guess input, hint button, AI hint display

### 3. ResultPage (`/finished`)
- **State**: `finished`
- **Components**: Game result, final scores, play again button

## 🎵 Audio Features
- Background music
- Sound effects untuk:
  - Correct answer
  - Wrong answer
  - Victory
  - Defeat
- Audio controller dengan toggle mute/unmute

## 🔐 Security & Validation
- CORS enabled untuk localhost:5173
- Input validation untuk tebakan (1-100)
- Socket room isolation
- Player state management
- Timeout handling untuk disconnected players

## 📊 Game Statistics
- Real-time score tracking
- Round-by-round results
- Player status (sudah menebak/belum)
- Final leaderboard

## 🛠️ Technology Stack Summary

**Frontend**:
- React 19.1.0 dengan functional components + hooks
- React Router untuk navigation
- Socket.io-client untuk real-time communication
- CSS untuk styling
- Vite untuk bundling

**Backend**:
- Node.js dengan Express framework
- Socket.io untuk WebSocket communication
- Google Generative AI untuk AI hints
- CORS untuk cross-origin requests
- Dotenv untuk environment management

**External Services**:
- Google Generative AI (Gemini-1.5-flash)

---

*Dokumentasi ini menjelaskan alur lengkap aplikasi Tebak Angka Multiplayer dari sisi client maupun server, termasuk semua socket events, game logic, dan integrasi AI.*
