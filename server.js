const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("AIR FLIGHT SERVER ONLINE ✈️");
});

const wss = new WebSocket.Server({
  server
});

const rooms = new Map();
const players = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

  } while (rooms.has(code));

  return code;
}

function generatePlayerId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 8)
  );
}

function send(ws, data) {
  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(roomCode, data) {
  const room = rooms.get(roomCode);

  if (!room) return;

  for (const playerId of room.players) {
    const player = players.get(playerId);

    if (player) {
      send(player.ws, data);
    }
  }
}

function getRoomPlayers(roomCode) {
  const room = rooms.get(roomCode);

  if (!room) return [];

  return Array.from(room.players)
    .map(id => players.get(id))
    .filter(Boolean)
    .map(player => ({
      id: player.id,
      plane: player.plane,

      x: player.x,
      y: player.y,
      z: player.z,

      rx: player.rx,
      ry: player.ry,
      rz: player.rz,

      score: player.score
    }));
}

function sendRoomPlayers(roomCode) {
  broadcastRoom(roomCode, {
    type: "players",
    players: getRoomPlayers(roomCode)
  });
}

function removePlayerFromRoom(player) {
  if (!player.room) return;

  const roomCode = player.room;
  const room = rooms.get(roomCode);

  if (!room) {
    player.room = null;
    return;
  }

  room.players.delete(player.id);

  player.room = null;

  broadcastRoom(roomCode, {
    type: "playerLeft",
    id: player.id
  });

  if (room.host === player.id) {

    const nextHost = room.players.values().next().value;

    if (nextHost) {
      room.host = nextHost;

      const newHost = players.get(nextHost);

      if (newHost) {
        send(newHost.ws, {
          type: "hostChanged"
        });
      }
    }
  }

  if (room.players.size === 0) {
    rooms.delete(roomCode);
  }
  else {
    sendRoomPlayers(roomCode);
  }
}

function joinRoom(player, roomCode) {

  roomCode = String(roomCode || "")
    .trim()
    .toUpperCase();

  const room = rooms.get(roomCode);

  if (!room) {
    send(player.ws, {
      type: "error",
      message: "La sala no existe."
    });

    return;
  }

  if (room.started) {
    send(player.ws, {
      type: "error",
      message: "La partida ya comenzó."
    });

    return;
  }

  if (room.players.size >= 8) {
    send(player.ws, {
      type: "error",
      message: "La sala está llena."
    });

    return;
  }

  if (player.room) {
    removePlayerFromRoom(player);
  }

  player.room = roomCode;

  room.players.add(player.id);

  send(player.ws, {
    type: "roomJoined",
    room: roomCode,
    players: getRoomPlayers(roomCode)
  });

  sendRoomPlayers(roomCode);
}

function createRoom(player) {

  if (player.room) {
    removePlayerFromRoom(player);
  }

  const code = generateRoomCode();

  const room = {
    code,
    host: player.id,
    started: false,
    players: new Set()
  };

  rooms.set(code, room);

  player.room = code;

  room.players.add(player.id);

  send(player.ws, {
    type: "roomCreated",
    room: code
  });

  sendRoomPlayers(code);
}

function findRandomRoom(player) {

  const availableRooms = Array.from(
    rooms.values()
  ).filter(room => {

    return (
      !room.started &&
      room.players.size > 0 &&
      room.players.size < 8
    );

  });

  if (availableRooms.length === 0) {

    send(player.ws, {
      type: "error",
      message: "No hay partidas disponibles."
    });

    return;
  }

  const room =
    availableRooms[
      Math.floor(
        Math.random() *
        availableRooms.length
      )
    ];

  send(player.ws, {
    type: "randomRoomFound",
    room: room.code
  });
}

function startRoom(player, roomCode) {

  roomCode = String(roomCode || "")
    .trim()
    .toUpperCase();

  const room = rooms.get(roomCode);

  if (!room) {
    send(player.ws, {
      type: "error",
      message: "La sala no existe."
    });

    return;
  }

  if (room.host !== player.id) {
    send(player.ws, {
      type: "error",
      message: "Solo el creador puede iniciar la partida."
    });

    return;
  }

  if (room.players.size < 1) {
    send(player.ws, {
      type: "error",
      message: "No hay jugadores en la sala."
    });

    return;
  }

  room.started = true;

  broadcastRoom(roomCode, {
    type: "roomStarted",
    room: roomCode
  });
}

function handleMessage(player, data) {

  if (!data || typeof data.type !== "string") {
    return;
  }

  /* =========================
     CREAR SALA
  ========================= */

  if (data.type === "createRoom") {

    player.plane =
      Number.isInteger(data.plane)
        ? data.plane
        : 0;

    createRoom(player);

    return;
  }

  /* =========================
     UNIRSE POR CÓDIGO
  ========================= */

  if (data.type === "joinRoom") {

    player.plane =
      Number.isInteger(data.plane)
        ? data.plane
        : 0;

    joinRoom(
      player,
      data.room
    );

    return;
  }

  /* =========================
     BUSCAR PARTIDA AL AZAR
  ========================= */

  if (data.type === "findRandomRoom") {

    player.plane =
      Number.isInteger(data.plane)
        ? data.plane
        : 0;

    findRandomRoom(player);

    return;
  }

  /* =========================
     INICIAR SALA
  ========================= */

  if (data.type === "startRoom") {

    startRoom(
      player,
      data.room
    );

    return;
  }

  /* =========================
     ACTUALIZAR JUGADOR
  ========================= */

  if (data.type === "update") {

    if (!player.room) {
      return;
    }

    const room =
      rooms.get(player.room);

    if (!room) {
      return;
    }

    player.x =
      Number(data.x) || 0;

    player.y =
      Number(data.y) || 0;

    player.z =
      Number(data.z) || 0;

    player.rx =
      Number(data.rx) || 0;

    player.ry =
      Number(data.ry) || 0;

    player.rz =
      Number(data.rz) || 0;

    player.score =
      Number(data.score) || 0;

    player.plane =
      Number.isInteger(data.plane)
        ? data.plane
        : player.plane;

    sendRoomPlayers(
      player.room
    );

    return;
  }

}

wss.on("connection", ws => {

  const player = {
    id: generatePlayerId(),

    ws,

    room: null,

    plane: 0,

    x: 0,
    y: 0,
    z: 0,

    rx: 0,
    ry: 0,
    rz: 0,

    score: 0
  };

  players.set(
    player.id,
    player
  );

  send(ws, {
    type: "welcome",
    id: player.id
  });

  ws.on("message", message => {

    try {

      const data =
        JSON.parse(
          message.toString()
        );

      handleMessage(
        player,
        data
      );

    }
    catch(error) {

      console.log(
        "Mensaje inválido:",
        error.message
      );

    }

  });

  ws.on("close", () => {

    removePlayerFromRoom(
      player
    );

    players.delete(
      player.id
    );

  });

  ws.on("error", error => {

    console.log(
      "WebSocket error:",
      error.message
    );

  });

});

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `✈️ AIR FLIGHT SERVER ONLINE - PORT ${PORT}`
    );

    console.log(
      `👥 WebSocket listo`
    );

  }
);