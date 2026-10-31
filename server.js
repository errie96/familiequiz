const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Inladen vragen
let rounds = [];
try {
  rounds = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
} catch (e) {
  console.error("Fout bij inladen questions.json:", e);
}

let players = {};
let hostSocketId = null;
let currentRoundIndex = 0;
let currentQuestionIndex = 0;
let gameState = "LOBBY";
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
    playerList: Object.values(players).map(p => ({ 
      name: p.name, 
      score: p.score,
      answered: p.answered // Host kan zien wie al heeft ingediend
    }))
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

    // Als de tijd op is, sluit de vraag automatisch af
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
      if (players[id].submittedAnswer === q.answer) {
        players[id].score += 10;
      }
      players[id].answered = false;
      players[id].submittedAnswer = null;
    });
  }

  io.emit('show_results', {
    correctAnswer: q ? q.answer : null,
    scores: Object.values(players).sort((a, b) => b.score - a.score)
  });
  broadcastState();
}

io.on('connection', (socket) => {
  socket.on('register_host', () => {
    hostSocketId = socket.id;
    socket.join('host_room');
    broadcastState();
  });

  socket.on('join_game', (name) => {
    players[socket.id] = {
      name: name.trim().slice(0, 20),
      score: 0,
      answered: false,
      submittedAnswer: null
    };
    socket.emit('joined', { name: players[socket.id].name });
    broadcastState();
  });

  // Pas actief als een speler op "Antwoord Indienen" heeft geklikt
  socket.on('submit_answer', (answerIndex) => {
    const player = players[socket.id];
    if (player && gameState === "QUESTION" && !player.answered) {
      player.answered = true;
      player.submittedAnswer = answerIndex;

      // Update naar host en spelers (zodat host ziet wie er klaar is)
      broadcastState();

      // Controleer of ALLE aangesloten spelers hebben ingediend
      const playerList = Object.values(players);
      const allSubmitted = playerList.length > 0 && playerList.every(p => p.answered);

      if (allSubmitted) {
        clearInterval(currentTimer);
        evaluateRound();
      }
    }
  });

  socket.on('player_blurred', () => {
    const player = players[socket.id];
    if (player && gameState === "QUESTION") {
      io.to('host_room').emit('cheat_warning', {
        playerName: player.name,
        timestamp: new Date().toLocaleTimeString('nl-NL')
      });
    }
  });

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
        players[id].submittedAnswer = null;
      });
      broadcastState();
      startCountdown(q.time || 30);
    }
  });

  socket.on('toggle_pause', () => {
    if (socket.id !== hostSocketId) return;

    if (gameState === "PAUSED") {
      gameState = "QUESTION";
      io.emit('resumed');
    } else if (gameState === "QUESTION") {
      gameState = "PAUSED";
      io.emit('paused', { message: "Pauze!" });
    }
    broadcastState();
  });

  socket.on('disconnect', () => {
    if (socket.id === hostSocketId) {
      hostSocketId = null;
    } else if (players[socket.id]) {
      delete players[socket.id];
      // Check opnieuw of de overgebleven spelers toevallig allemaal al klaar zijn
      const playerList = Object.values(players);
      if (gameState === "QUESTION" && playerList.length > 0 && playerList.every(p => p.answered)) {
        clearInterval(currentTimer);
        evaluateRound();
      } else {
        broadcastState();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server actief op poort ${PORT}`);
});
