const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// Quizvragen inladen
let rounds = [];
try {
  rounds = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
} catch (e) {
  console.error("Fout bij inladen questions.json:", e);
}

// Speler- & Host-state
let players = {};
let activeHostToken = null;  // Persistent token voor de host
let hostSocketId = null;     // Huidige actieve socket
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
      playerId: p.playerId,
      name: p.name,
      score: p.score,
      answered: p.answered,
      connected: p.connected
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
    Object.values(players).forEach(p => {
      if (p.submittedAnswer === q.answer) {
        p.score += 10;
      }
      p.answered = false;
      p.submittedAnswer = null;
    });
  }

  io.emit('show_results', {
    correctAnswer: q ? q.answer : null,
    scores: Object.values(players)
      .map(p => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score)
  });
  broadcastState();
}

io.on('connection', (socket) => {
  // 1. Host registratie & herstel na F5
  socket.on('register_host', ({ token }) => {
    // Als er nog geen token is, of het token matcht met de actieve sessie
    if (!activeHostToken || activeHostToken === token) {
      activeHostToken = token;
      hostSocketId = socket.id;
      socket.join('host_room');
      socket.emit('host_confirmed', { token: activeHostToken });
    } else {
      // Bestaande sessie overnemen / updaten naar de nieuwe socket
      hostSocketId = socket.id;
      socket.join('host_room');
      socket.emit('host_confirmed', { token: activeHostToken });
    }
    broadcastState();
  });

  // 2. Scorebord registratie
  socket.on('register_scoreboard', () => {
    socket.join('scoreboard_room');
    broadcastState();
  });

  // 3. Speler login / sessieherstel
  socket.on('init_player', ({ playerId, name }) => {
    if (playerId && players[playerId]) {
      const player = players[playerId];
      player.socketId = socket.id;
      player.connected = true;

      socket.emit('session_restored', {
        playerId: player.playerId,
        name: player.name,
        score: player.score,
        answered: player.answered,
        submittedAnswer: player.submittedAnswer
      });
    } else if (name && name.trim()) {
      const newPlayerId = 'p_' + Math.random().toString(36).substr(2, 9);
      players[newPlayerId] = {
        playerId: newPlayerId,
        socketId: socket.id,
        name: name.trim().slice(0, 20),
        score: 0,
        answered: false,
        submittedAnswer: null,
        connected: true
      };

      socket.emit('joined', {
        playerId: newPlayerId,
        name: players[newPlayerId].name
      });
    }
    broadcastState();
  });

  // 4. Antwoord definitief indienen
  socket.on('submit_answer', ({ playerId, answerIndex }) => {
    const player = players[playerId];
    if (player && gameState === "QUESTION" && !player.answered) {
      player.answered = true;
      player.submittedAnswer = answerIndex;

      broadcastState();

      const activePlayers = Object.values(players).filter(p => p.connected);
      const allDone = activePlayers.length > 0 && activePlayers.every(p => p.answered);

      if (allDone) {
        clearInterval(currentTimer);
        evaluateRound();
      }
    }
  });

  // 5. Anti-spiek waarschuwing
  socket.on('player_blurred', ({ playerId }) => {
    const player = players[playerId];
    if (player && gameState === "QUESTION") {
      io.to('host_room').emit('cheat_warning', {
        playerName: player.name,
        timestamp: new Date().toLocaleTimeString('nl-NL')
      });
    }
  });

  // 6. Host regie: Volgende vraag
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
      Object.values(players).forEach(p => {
        p.answered = false;
        p.submittedAnswer = null;
      });
      broadcastState();
      startCountdown(q.time || 30);
    }
  });

  // 7. Host regie: Pauze toggle
  socket.on('toggle_pause', () => {
    if (socket.id !== hostSocketId) return;

    if (gameState === "PAUSED") {
      gameState = "QUESTION";
      io.emit('resumed');
    } else if (gameState === "QUESTION") {
      gameState = "PAUSED";
      io.emit('paused');
    }
    broadcastState();
  });

  // 8. Disconnect: behoud host status bij F5
  socket.on('disconnect', () => {
    if (socket.id === hostSocketId) {
      // hostSocketId niet op null forceren zodat een refresh binnen enkele seconden naadloos herstelt
    } else {
      const player = Object.values(players).find(p => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        broadcastState();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server actief op poort ${PORT}`);
});
