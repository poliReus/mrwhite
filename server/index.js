const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*"; // in prod metti il dominio del frontend

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

// --------------------
// Load footballers list from calciatori.txt
// --------------------
function loadFootballers() {
  const filePath = path.join(__dirname, "calciatori.txt");
  if (!fs.existsSync(filePath)) {
    console.warn("⚠️  calciatori.txt non trovato. Creo una lista minima.");
    return ["Nicolò Barella", "Kylian Mbappé", "Erling Haaland"];
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    console.warn("⚠️  calciatori.txt ha pochi nomi. Aggiungo fallback.");
    return [...lines, "Nicolò Barella", "Kylian Mbappé"].filter(Boolean);
  }
  return lines;
}

const FOOTBALLERS = loadFootballers();

// --------------------
// In-memory rooms
// --------------------
/**
 * rooms[roomCode] = {
 *   code,
 *   hostId,
 *   players: Map(socketId -> { id, name }),
 *   started: boolean,
 *   footballer: string|null,
 *   impostorId: string|null,
 *   turnOrder: string[] (socketIds),
 * }
 */
const rooms = Object.create(null);

function generateRoomCode(len = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid confusing chars
  let code = "";
  for (let i = 0; i < len; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTurnOrderEnsureImpostorNotFirst(playerIds, impostorId) {
  // Create a random order, then force impostor not first.
  let order = shuffle(playerIds);

  if (order.length <= 1) return order;
  if (order[0] !== impostorId) return order;

  // swap impostor (at index 0) with a random index in [1..n-1]
  const swapIdx = 1 + Math.floor(Math.random() * (order.length - 1));
  [order[0], order[swapIdx]] = [order[swapIdx], order[0]];
  return order;
}

function roomStateForClient(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    footballerChosen: room.started ? true : false, // we don't show the name to everyone
    players: Array.from(room.players.values()).map((p) => ({ id: p.id, name: p.name })),
    turnOrder: room.turnOrder.map((id) => {
      const p = room.players.get(id);
      return p ? { id: p.id, name: p.name } : { id, name: "?" };
    })
  };
}

function emitRoomUpdate(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit("room:update", roomStateForClient(room));
}

// Small health endpoint
app.get("/health", (req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  // Create room (host)
  socket.on("room:create", ({ name }, cb) => {
    try {
      const trimmed = (name || "").trim();
      if (!trimmed) return cb?.({ ok: false, error: "Nome richiesto." });

      let code = generateRoomCode();
      while (rooms[code]) code = generateRoomCode();

      const room = {
        code,
        hostId: socket.id,
        players: new Map(),
        started: false,
        footballer: null,
        impostorId: null,
        turnOrder: []
      };

      rooms[code] = room;

      room.players.set(socket.id, { id: socket.id, name: trimmed });
      socket.join(code);

      emitRoomUpdate(code);
      cb?.({ ok: true, roomCode: code, hostId: room.hostId });
    } catch (e) {
      cb?.({ ok: false, error: "Errore creazione stanza." });
    }
  });

  // Join room
  socket.on("room:join", ({ roomCode, name }, cb) => {
    try {
      const code = (roomCode || "").trim().toUpperCase();
      const trimmed = (name || "").trim();
      const room = rooms[code];

      if (!room) return cb?.({ ok: false, error: "Stanza non trovata." });
      if (!trimmed) return cb?.({ ok: false, error: "Nome richiesto." });
      if (room.started) return cb?.({ ok: false, error: "Partita già iniziata." });

      room.players.set(socket.id, { id: socket.id, name: trimmed });
      socket.join(code);

      emitRoomUpdate(code);
      cb?.({ ok: true, roomCode: code, hostId: room.hostId });
    } catch (e) {
      cb?.({ ok: false, error: "Errore ingresso stanza." });
    }
  });

  // Start game (host only)
  socket.on("game:start", ({ roomCode }, cb) => {
    try {
      const code = (roomCode || "").trim().toUpperCase();
      const room = rooms[code];
      if (!room) return cb?.({ ok: false, error: "Stanza non trovata." });
      if (room.hostId !== socket.id) return cb?.({ ok: false, error: "Solo l'host può avviare." });

      const playerIds = Array.from(room.players.keys());
      if (playerIds.length < 3) {
        return cb?.({ ok: false, error: "Servono almeno 3 giocatori." });
      }

      const footballer = pickRandom(FOOTBALLERS);
      const impostorId = pickRandom(playerIds);

      const turnOrder = buildTurnOrderEnsureImpostorNotFirst(playerIds, impostorId);

      room.started = true;
      room.footballer = footballer;
      room.impostorId = impostorId;
      room.turnOrder = turnOrder;

      // Send secret info to each player
      for (const pid of playerIds) {
        const isImpostor = pid === impostorId;
        io.to(pid).emit("game:secret", {
          started: true,
          isImpostor,
          footballer: isImpostor ? null : footballer
        });
      }

      emitRoomUpdate(code);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: "Errore avvio partita." });
    }
  });

  // Optional: new round (host only) - same players, new footballer & impostor
  socket.on("game:newRound", ({ roomCode }, cb) => {
    try {
      const code = (roomCode || "").trim().toUpperCase();
      const room = rooms[code];
      if (!room) return cb?.({ ok: false, error: "Stanza non trovata." });
      if (room.hostId !== socket.id) return cb?.({ ok: false, error: "Solo l'host può avviare." });

      const playerIds = Array.from(room.players.keys());
      if (playerIds.length < 3) {
        return cb?.({ ok: false, error: "Servono almeno 3 giocatori." });
      }

      const footballer = pickRandom(FOOTBALLERS);
      const impostorId = pickRandom(playerIds);
      const turnOrder = buildTurnOrderEnsureImpostorNotFirst(playerIds, impostorId);

      room.started = true;
      room.footballer = footballer;
      room.impostorId = impostorId;
      room.turnOrder = turnOrder;

      for (const pid of playerIds) {
        const isImpostor = pid === impostorId;
        io.to(pid).emit("game:secret", {
          started: true,
          isImpostor,
          footballer: isImpostor ? null : footballer
        });
      }

      emitRoomUpdate(code);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: "Errore nuova manche." });
    }
  });

    // Sync state for a client (useful if they navigated and missed events)
  socket.on("game:getState", ({ roomCode }, cb) => {
    try {
      const code = (roomCode || "").trim().toUpperCase();
      const room = rooms[code];
      if (!room) return cb?.({ ok: false, error: "Stanza non trovata." });

      // Ensure the socket is in the room (optional but helpful)
      socket.join(code);

      // If this socket isn't registered as a player, reject (or auto-add if you want)
      if (!room.players.has(socket.id)) {
        return cb?.({ ok: false, error: "Non risulti nella stanza. Torna in lobby e rientra." });
      }

      const secret = room.started
        ? {
            started: true,
            isImpostor: room.impostorId === socket.id,
            footballer: room.impostorId === socket.id ? null : room.footballer
          }
        : { started: false, isImpostor: false, footballer: null };

      cb?.({
        ok: true,
        room: roomStateForClient(room),
        secret
      });
    } catch (e) {
      cb?.({ ok: false, error: "Errore sync partita." });
    }
  });


  socket.on("disconnect", () => {
    // Remove player from any room they are in; if host leaves, close room.
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      if (!room.players.has(socket.id)) continue;

      const wasHost = room.hostId === socket.id;
      room.players.delete(socket.id);

      if (wasHost) {
        // close room
        io.to(code).emit("room:closed");
        delete rooms[code];
        continue;
      }

      // Remove from turn order if present
      room.turnOrder = room.turnOrder.filter((id) => id !== socket.id);

      // If impostor left mid-game, keep game running (simple) — or you could auto newRound.
      emitRoomUpdate(code);

      // If no players left, delete room
      if (room.players.size === 0) {
        delete rooms[code];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Loaded footballers: ${FOOTBALLERS.length}`);
});
