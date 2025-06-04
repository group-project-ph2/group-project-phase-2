const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

console.log(
  "🚀 Google AI initialized with API key:",
  process.env.GOOGLE_API_KEY ? "Present" : "Missing"
);

let rooms = {};
let waitingRoom = null;

class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.gameState = "waiting"; // waiting, playing, finished
    this.currentRound = 0;
    this.maxRounds = 3;
    this.currentPlayer = 0;
    this.targetNumber = 0;
    this.scores = {};
    this.timer = null;
    this.roundWinner = null;
    this.roundTimeLeft = 25; // Timer untuk semua player
    this.playerGuesses = {}; // Menyimpan tebakan setiap player
  }

  addPlayer(player) {
    if (this.players.length < 4) {
      this.players.push(player);
      this.scores[player.id] = 0;
      return true;
    }
    return false;
  }

  removePlayer(playerId) {
    this.players = this.players.filter((p) => p.id !== playerId);
    delete this.scores[playerId];

    if (this.gameState === "playing") {
      if (this.players.length === 1) {
        // Jika hanya tersisa 1 player, player tersebut menjadi pemenang
        const remainingPlayer = this.players[0];
        const result = {
          type: "winner",
          winner: remainingPlayer.name,
          winnerId: remainingPlayer.id,
          reason: "Player lain keluar dari permainan",
        };

        this.gameState = "finished";
        io.to(this.id).emit("gameEnd", {
          result,
          finalScores: this.scores,
        });
      } else if (this.players.length < 1) {
        // Jika tidak ada player tersisa, hapus room
        this.endGame();
      }
    }
  }

  startGame() {
    if (this.players.length >= 2) {
      this.gameState = "playing";
      this.currentRound = 1;
      this.startRound();
    }
  }

  startRound() {
    this.targetNumber = Math.floor(Math.random() * 100) + 1;
    this.roundWinner = null;
    this.roundTimeLeft = 25;
    this.playerGuesses = {};

    // Reset semua player untuk round baru
    this.players.forEach((player) => {
      this.playerGuesses[player.id] = null;
    });

    this.startRoundTimer();
  }

  startRoundTimer() {
    // Emit ke semua player bahwa round dimulai
    io.to(this.id).emit("roundStarted", {
      round: this.currentRound,
      timeLeft: this.roundTimeLeft,
      message: "Semua player bisa menebak sekarang!",
    });

    // Timer countdown untuk semua player
    this.timer = setInterval(() => {
      this.roundTimeLeft--;

      // Emit update timer ke semua player
      io.to(this.id).emit("timerUpdate", {
        timeLeft: this.roundTimeLeft,
      });

      if (this.roundTimeLeft <= 0) {
        this.endRoundByTimeout();
      }
    }, 1000);
  }

  makeGuess(playerId, guess) {
    // Cek apakah player sudah menebak di round ini
    if (this.playerGuesses[playerId] !== null || this.roundWinner) {
      return; // Player sudah menebak atau round sudah selesai
    }

    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    this.playerGuesses[playerId] = guess;

    if (guess === this.targetNumber) {
      // Player menebak benar
      this.scores[playerId]++;
      this.roundWinner = playerId;

      clearInterval(this.timer);

      io.to(this.id).emit("correctGuess", {
        playerId,
        playerName: player.name,
        targetNumber: this.targetNumber,
        guess: guess,
      });

      setTimeout(() => this.endRound(), 2000);
    } else {
      // Player menebak salah - HANYA kirim ke player yang menebak
      io.to(playerId).emit("wrongGuess", {
        playerId,
        playerName: player.name,
        guess,
        targetNumber: this.targetNumber,
      });

      // Emit bahwa player sudah menebak (tanpa detail tebakan)
      io.to(this.id).emit("playerGuessed", {
        playerId,
        playerName: player.name,
        hasGuessed: true,
      });

      // CEK APAKAH SEMUA PLAYER SUDAH MENEBAK
      this.checkAllPlayersGuessed();
    }
  }

  // Fungsi baru untuk mengecek apakah semua player sudah menebak
  checkAllPlayersGuessed() {
    const allPlayersGuessed = this.players.every(
      (player) => this.playerGuesses[player.id] !== null
    );

    if (allPlayersGuessed && !this.roundWinner) {
      // Semua player sudah menebak tapi tidak ada yang benar
      clearInterval(this.timer);

      io.to(this.id).emit("allPlayersGuessed", {
        message: "Semua player sudah menebak! Lanjut ke round berikutnya...",
        targetNumber: this.targetNumber,
      });

      setTimeout(() => this.endRound(), 2000);
    }
  }

  endRoundByTimeout() {
    clearInterval(this.timer);

    const playersNotGuessed = this.players.filter(
      (p) => this.playerGuesses[p.id] === null
    );

    if (playersNotGuessed.length > 0) {
      io.to(this.id).emit("playersTimeout", {
        players: playersNotGuessed.map((p) => p.name),
        targetNumber: this.targetNumber,
      });
    }

    setTimeout(() => this.endRound(), 2000);
  }

  endRound() {
    clearInterval(this.timer);

    if (this.currentRound < this.maxRounds) {
      this.currentRound++;
      io.to(this.id).emit("roundEnd", {
        round: this.currentRound - 1,
        scores: this.scores,
        winner: this.roundWinner,
      });
      setTimeout(() => this.startRound(), 3000);
    } else {
      this.endGame();
    }
  }

  endGame() {
    this.gameState = "finished";
    const maxScore = Math.max(...Object.values(this.scores));
    const winners = Object.keys(this.scores).filter(
      (id) => this.scores[id] === maxScore
    );

    this.players.forEach((player) => {
      let personalResult;

      if (maxScore === 0) {
        personalResult = {
          type: "draw",
          message: "Tidak ada yang berhasil menebak!",
        };
      } else if (winners.length > 1) {
        if (winners.includes(player.id)) {
          personalResult = {
            type: "tie",
            message: "Permainan Seri! Anda salah satu pemenang!",
          };
        } else {
          personalResult = {
            type: "lose",
            message: "Anda Kalah! Permainan berakhir seri.",
          };
        }
      } else {
        if (winners[0] === player.id) {
          personalResult = { type: "winner", message: "Selamat! Anda Menang!" };
        } else {
          const winner = this.players.find((p) => p.id === winners[0]);
          personalResult = {
            type: "lose",
            message: `Anda Kalah! Pemenang: ${winner.name}`,
          };
        }
      }

      
      io.to(player.id).emit("gameEnd", {
        result: personalResult,
        finalScores: this.scores,
      });
    });
  }

  async getAIHint() {
    try {
      console.log("🤖 Generating AI hint for number:", this.targetNumber);

      const prompt = `Kamu adalah asisten AI di dalam permainan tebak angka.

Tugasmu adalah memberikan **hint lucu, kreatif, dan mudah dipahami oleh pemain berusia 10–20 tahun**. Hindari bahasa yang terlalu rumit atau terlalu formal. Hint harus terasa **familiar**, **ringan**, dan **relate dengan kehidupan anak sekolah, pop culture, game, media sosial, atau fakta umum sehari-hari**.

Jangan sebut langsung angkanya. Petunjuk boleh lucu, sarkas, atau mengandung sedikit humor, tapi tetap sopan dan jelas. Hint maksimal 1–2 kalimat.

Contoh:
- Angka = 78 → "Nilai yang bikin guru bilang: 'Kamu bisa lebih baik dari ini loh!'"
- Angka = 45 → "Tahun yang sering banget muncul pas upacara bendera atau pelajaran PKN."
- Angka = 360 → "Kalau kamu muter balik satu lingkaran penuh, derajatnya jadi...?"
- Angka = 100 → "Nilai yang bikin kamu langsung pamer ke grup kelas."

Sekarang buatkan 1 hint berdasarkan angka berikut:

Angka = ${this.targetNumber}`;

      console.log("📝 Sending prompt to AI...");
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const hint = response.text();

      console.log("✅ AI hint generated successfully:", hint);
      return hint;
    } catch (error) {
      console.error("❌ Error generating AI hint:", error.message);
      console.error("Full error:", error);

      
      const fallbackHints = {
        1: "Angka yang paling pertama, kayak ranking kamu di hati mama!",
        10: "Angka yang bikin kamu bangga kalau dapet di ulangan matematika.",
        50: "Setengah dari seratus, kayak battery HP yang udah mulai low.",
        100: "Angka yang bikin kamu langsung screenshot nilai buat dipamer ke grup kelas!",
      };

      return (
        fallbackHints[this.targetNumber] ||
        `Hint: Coba tebak angka antara 1-100, yang ini spesial banget!`
      );
    }
  }
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
  
    socket.on("joinGame", (playerName) => {
      const player = { id: socket.id, name: playerName };
  
      if (!waitingRoom || waitingRoom.players.length >= 4) {
        const roomId = "room_" + Date.now();
        waitingRoom = new GameRoom(roomId);
        rooms[roomId] = waitingRoom;
      }
  
      if (waitingRoom.addPlayer(player)) {
        socket.join(waitingRoom.id);
        socket.roomId = waitingRoom.id;
  
        const isRoomMaster = waitingRoom.players.length === 1;
  
        socket.emit("joinedRoom", {
          roomId: waitingRoom.id,
          isRoomMaster,
          players: waitingRoom.players,
        });
  
        socket.to(waitingRoom.id).emit("playerJoined", {
          player,
          players: waitingRoom.players,
        });
  
        if (waitingRoom.players.length === 4) {
          waitingRoom = null; 
        }
      }
    });
  
    socket.on("startGame", () => {
      const room = rooms[socket.roomId];
      if (room && room.players[0].id === socket.id && room.players.length >= 2) {
        room.startGame();
        io.to(room.id).emit("gameStarted", {
          round: 1,
          totalRounds: room.maxRounds,
        });
      }
    });
  
    socket.on("makeGuess", (guess) => {
      const room = rooms[socket.roomId];
      if (room) {
        room.makeGuess(socket.id, parseInt(guess));
      }
    });
  
    socket.on("requestHint", async () => {
      const room = rooms[socket.roomId];
      if (room && room.gameState === "playing") {
        const hint = await room.getAIHint();
        socket.emit("aiHint", hint); 
      }
    });
  
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
  
      if (socket.roomId && rooms[socket.roomId]) {
        const room = rooms[socket.roomId];
        const disconnectedPlayer = room.players.find((p) => p.id === socket.id);
        const wasRoomMaster = room.players[0]?.id === socket.id; 
  
        room.removePlayer(socket.id);
  
        if (disconnectedPlayer) {
          // Jika yang keluar adalah room master dan masih ada player lain
          if (wasRoomMaster && room.players.length > 0) {
            // Player pertama yang tersisa menjadi room master baru
            const newRoomMaster = room.players[0];
  
            // Emit event ke semua player bahwa ada room master baru
            io.to(room.id).emit("roomMasterChanged", {
              newRoomMaster: newRoomMaster,
              message: `${newRoomMaster.name} sekarang menjadi room master`,
            });
          }
  
          io.to(room.id).emit("playerLeft", {
            player: disconnectedPlayer,
            players: room.players,
            wasRoomMaster: wasRoomMaster,
          });
        }
  
        if (room.players.length === 0) {
          delete rooms[socket.roomId];
          if (waitingRoom && waitingRoom.id === socket.roomId) {
            waitingRoom = null;
          }
        }
      }
    });
  });
  
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  