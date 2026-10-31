const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// Quizdata inladen
let rounds = [];
try {
  rounds = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
} catch (e) {
  console.error("Fout bij inladen questions.json:", e);
}

// Spelstatus
let players = {}; // socketId -> { name, score, answered, lastAnswer }
let hostSocketId = null;
let currentRoundIndex = 0;
let currentQuestionIndex = 0;
let gameState = "LOBBY"; // LOBBY, QUESTION, PAUSED, SCOREBOARD, END
let currentTimer = null;
let timeLeft = 0;

function getCurrentQuestion() {
  if (rounds[currentRoundIndex] && rounds[currentRoundIndex].questions[currentQuestionIndex]) {
    return rounds[currentRoundIndex].questions[currentQuestionIndex];
  }
  return null;
}

function broadcastState() {
  const currentQ = getCurrentQuestion();
  io.emit('state_update', {
    gameState,
    roundName: rounds[currentRoundIndex]?.roundName || "Familiequiz",
    currentQuestion: (gameState === "QUESTION" || gameState === "PAUSED") ? currentQ : null,
    timeLeft,
    playerList: Object.values(players).map(p => ({ name: p.name, score: p.score }))
  });
}

function startCountdown(duration) {
  clearInterval(currentTimer);
  timeLeft = duration;
  io.emit('timer_tick', { timeLeft });

  currentTimer = setInterval(() => {
    if (gameState === "PAUSED") return;

    timeLeft--;
    io.emit('timer_tick', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(currentTimer);
      evaluateRound();
    }
  }, 1000);
}

function evaluateRound() {
  gameState = "SCOREBOARD";
  const q = getCurrentQuestion();
  
  if (q) {
    Object.keys(players).forEach(id => {
      if (players[id].lastAnswer === q.answer) {
        players[id].score += 10;
      }
      players[id].answered = false;
      players[id].lastAnswer = null;
    });
  }

  io.emit('show_results', {
    correctAnswer: q ? q.answer : null,
    scores: Object.values(players).sort((a, b) => b.score - a.score)
  });
  broadcastState();
}

io.on('connection', (socket) => {
  // Registratie als Host
  socket.on('register_host', () => {
    hostSocketId = socket.id;
    socket.join('host_room');
    socket.emit('host_registered');
    broadcastState();
  });

  // Registratie als Speler
  socket.on('join_game', (name) => {
    players[socket.id] = {
      name: name.trim().slice(0, 20),
      score: 0,
      answered: false,
      lastAnswer: null
    };
    socket.emit('joined', { name: players[socket.id].name });
    broadcastState();
  });

  // Speler dient antwoord in
  socket.on('submit_answer', (answerIndex) => {
    const player = players[socket.id];
    if (player && gameState === "QUESTION" && !player.answered) {
      player.answered = true;
      player.lastAnswer = answerIndex;
      socket.emit('answer_received');

      const allDone = Object.values(players).every(p => p.answered);
      if (allDone && Object.keys(players).length > 0) {
        clearInterval(currentTimer);
        evaluateRound();
      }
    }
  });

  // Anti-spiek: tabblad verlaten
  socket.on('player_blurred', (data) => {
    const player = players[socket.id];
    if (player && gameState === "QUESTION") {
      io.to('host_room').emit('cheat_warning', {
        playerName: player.name,
        timestamp: new Date().toLocaleTimeString('nl-NL')
      });
    }
  });

  // Host actie: Volgende vraag of start
  socket.on('next_question', () => {
    if (socket.id !== hostSocketId) return;

    if (gameState === "LOBBY") {
      gameState = "QUESTION";
      currentRoundIndex = 0;
      currentQuestionIndex = 0;
    } else if (gameState === "SCOREBOARD") {
      currentQuestionIndex++;
      if (currentQuestionIndex >= rounds[currentRoundIndex].questions.length) {
        currentRoundIndex++;
        currentQuestionIndex = 0;
      }

      if (currentRoundIndex >= rounds.length) {
        gameState = "END";
        broadcastState();
        return;
      }
      gameState = "QUESTION";
    }

    const q = getCurrentQuestion();
    if (q) {
      Object.keys(players).forEach(id => {
        players[id].answered = false;
        players[id].lastAnswer = null;
      });
      broadcastState();
      startCountdown(q.time || 20);
    }
  });

  // Host actie: Pauzeknop
  socket.on('toggle_pause', () => {
    if (socket.id !== hostSocketId) return;

    if (gameState === "PAUSED") {
      gameState = "QUESTION";
      io.emit('resumed');
    } else if (gameState === "QUESTION") {
      gameState = "PAUSED";
      io.emit('paused', { message: "Pauze! Even tijd voor eten en drinken." });
    }
    broadcastState();
  });

  // Verbinding verbroken
  socket.on('disconnect', () => {
    if (socket.id === hostSocketId) {
      hostSocketId = null;
    } else if (players[socket.id]) {
      delete players[socket.id];
      broadcastState();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server actief op poort ${PORT}`);
});
