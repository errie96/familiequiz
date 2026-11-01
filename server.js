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

// Speler- & Host-status
let players = {}; // playerId -> { playerId, socketId, name, score, answered, submittedAnswer, connected, lastAlertTime }
let activeHostToken = null;
let hostSocketId = null;
let currentRoundIndex = 0;
let currentQuestionIndex = 0;
let gameState = "LOBBY"; // LOBBY, QUESTION, PAUSED, WAITING_NEXT, END

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
    currentRoundIndex,
    currentQuestionIndex,
    playerList: Object.values(players).map(p => ({
      playerId: p.playerId,
      name: p.name,
      score: p.score,
      answered: p.answered,
      connected: p.connected
    }))
  });
}

function completeQuestion() {
  const q = getCurrentQuestion();
  gameState = "WAITING_NEXT";

  if (q) {
    Object.values(players).forEach(p => {
      if (p.submittedAnswer === q.answer) {
        p.score += 10;
      }
      p.answered = false;
      p.submittedAnswer = null;
    });
  }

  io.emit('all_submitted');
  broadcastState();
}

io.on('connection', (socket) => {
  // 1. Host registratie & F5 herstel
  socket.on('register_host', ({ token }) => {
    if (!activeHostToken || activeHostToken === token) {
      activeHostToken = token;
    }
    hostSocketId = socket.id;
    socket.join('host_room');
    socket.emit('host_confirmed', { token: activeHostToken });
    broadcastState();
  });

  // 2. Scoreboard registratie
  socket.on('register_scoreboard', () => {
    socket.join('scoreboard_room');
    broadcastState();
  });

  // 3. Speler login / herstel
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
        connected: true,
        lastAlertTime: 0
      };

      socket.emit('joined', {
        playerId: newPlayerId,
        name: players[newPlayerId].name
      });
    }
    broadcastState();
  });

  // 4. Antwoord indienen
  socket.on('submit_answer', ({ playerId, answerIndex }) => {
    const player = players[playerId];
    if (player && gameState === "QUESTION" && !player.answered) {
      player.answered = true;
      player.submittedAnswer = answerIndex;

      broadcastState();

      const activePlayers = Object.values(players).filter(p => p.connected);
      const allDone = activePlayers.length > 0 && activePlayers.every(p => p.answered);

      if (allDone) {
        completeQuestion();
      }
    }
  });

  // 5. Anti-spiek (alleen buiten LOBBY en PAUSED)
  socket.on('player_blurred', ({ playerId, reason }) => {
    if (gameState === "LOBBY" || gameState === "PAUSED") return;

    const player = players[playerId];
    if (!player) return;

    const now = Date.now();
    if (player.lastAlertTime && (now - player.lastAlertTime) < 3500) {
      return;
    }
    player.lastAlertTime = now;

    io.to('host_room').emit('cheat_warning', {
      playerName: player.name,
      reason: reason || 'app_switch',
      timestamp: new Date().toLocaleTimeString('nl-NL')
    });
  });

  // 6. Host: Volgende vraag
  socket.on('next_question', () => {
    if (socket.id !== hostSocketId) return;

    if (gameState === "LOBBY") {
      gameState = "QUESTION";
      currentRoundIndex = 0;
      currentQuestionIndex = 0;
    } else if (gameState === "WAITING_NEXT" || gameState === "QUESTION") {
      currentQuestionIndex++;
      if (currentQuestionIndex >= rounds[currentRoundIndex].questions.length) {
        currentRoundIndex++;
        currentQuestionIndex = 0;
      }

      if (currentRoundIndex >= rounds.length) {
        gameState = "END";
        
        // Eenvoudig overzicht van alle vragen zonder teamkeuzes
        const reviewOverview = rounds.map(r => ({
          roundName: r.roundName,
          questions: r.questions.map(q => ({
            question: q.question,
            options: q.options,
            correctAnswer: q.answer,
            type: q.type,
            imageUrl: q.imageUrl || null,
            audioUrl: q.audioUrl || null
          }))
        }));

        io.emit('game_over', {
          overview: reviewOverview,
          finalScores: Object.values(players).sort((a, b) => b.score - a.score)
        });

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
    }
  });

  // 7. Host: Vraag teruggaan
  socket.on('prev_question', () => {
    if (socket.id !== hostSocketId) return;
    if (gameState === "LOBBY") return;

    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      gameState = "QUESTION";
    } else if (currentRoundIndex > 0) {
      currentRoundIndex--;
      currentQuestionIndex = rounds[currentRoundIndex].questions.length - 1;
      gameState = "QUESTION";
    }

    const q = getCurrentQuestion();
    if (q) {
      Object.values(players).forEach(p => {
        p.answered = false;
        p.submittedAnswer = null;
      });
      broadcastState();
    }
  });

  // 8. Host: Pauze aan/uit
  socket.on('toggle_pause', () => {
    if (socket.id !== hostSocketId) return;

    if (gameState === "PAUSED") {
      gameState = "QUESTION";
      io.emit('resumed');
    } else {
      gameState = "PAUSED";
      io.emit('paused');
    }
    broadcastState();
  });

  // 9. Host: Geheel nieuwe quiz starten
  socket.on('reset_quiz', () => {
    if (socket.id !== hostSocketId) return;

    gameState = "LOBBY";
    currentRoundIndex = 0;
    currentQuestionIndex = 0;
    players = {};

    io.emit('quiz_reset');
    broadcastState();
  });

  // 10. Disconnect
  socket.on('disconnect', () => {
    if (socket.id !== hostSocketId) {
      const player = Object.values(players).find(p => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        const activePlayers = Object.values(players).filter(p => p.connected);
        if (gameState === "QUESTION" && activePlayers.length > 0 && activePlayers.every(p => p.answered)) {
          completeQuestion();
        } else {
          broadcastState();
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Quiz server actief op http://localhost:${PORT}`);
});
