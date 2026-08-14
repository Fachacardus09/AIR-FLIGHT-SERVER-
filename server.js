const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("AIR FLIGHT SERVER ONLINE ✈️");
});

const server = new WebSocket.Server({
    server: httpServer
});

/* =====================================================
   JUGADORES, SALAS Y MISILES
===================================================== */

const players = new Map();
const rooms = new Map();
const missiles = new Map();

/* =====================================================
   CONFIGURACIÓN GENERAL
===================================================== */

const MAX_PLAYERS_PER_ROOM = 8;
const MAX_HEALTH = 100;

const MISSILE_SPEED = 2;
const MISSILE_LIFETIME = 5000;
const MISSILE_DAMAGE = 25;
const MISSILE_HIT_DISTANCE = 45;

const KILL_SCORE = 100;

const RESPAWN_TIME = 3000;

/* =====================================================
   CONFIGURACIÓN DE PARTIDA
===================================================== */

const MATCH_DURATION = 5 * 60 * 1000;
const MIN_PLAYERS_TO_START = 2;
const MATCH_TICK = 1000;

/* =====================================================
   RECONEXIÓN
===================================================== */

const RECONNECT_GRACE_TIME = 15000;

/* =====================================================
   LÍMITES DE SEGURIDAD
===================================================== */

const MAX_POSITION = 100000;
const MAX_SCORE = 1000000000;
const MAX_MESSAGE_SIZE = 16384;

/* =====================================================
   UTILIDADES
===================================================== */

function createId() {
    return Date.now().toString(36) +
        Math.random().toString(36).substring(2, 8);
}

function createMissileId() {
    return "m_" +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 8);
}

function createReconnectToken() {
    return createId() +
        "_" +
        Math.random().toString(36).substring(2, 12);
}

function createRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for (let i = 0; i < 6; i++) {

            code += chars[
                Math.floor(
                    Math.random() * chars.length
                )
            ];
        }

    } while (rooms.has(code));

    return code;
}

function send(socket, data) {

    if (
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {

        try {
            socket.send(
                JSON.stringify(data)
            );
        } catch (error) {
            /* Ignorar error de envío */
        }
    }
}

/* =====================================================
   VALIDACIÓN NUMÉRICA
===================================================== */

function safeNumber(value, min, max, fallback = 0) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    if (number < min) {
        return min;
    }

    if (number > max) {
        return max;
    }

    return number;
}

function isValidVector(x, y, z) {

    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(z) &&
        Math.abs(x) <= MAX_POSITION &&
        Math.abs(y) <= MAX_POSITION &&
        Math.abs(z) <= MAX_POSITION
    );
}

function isValidPlane(plane) {

    return (
        Number.isInteger(plane) &&
        plane >= 0 &&
        plane <= 13
    );
}

/* =====================================================
   BROADCAST
===================================================== */

function broadcastRoom(
    roomCode,
    data,
    exceptId = null
) {

    const room =
        rooms.get(roomCode);

    if (!room) return;

    for (const playerId of room.players) {

        if (playerId === exceptId) {
            continue;
        }

        const player =
            players.get(playerId);

        if (
            player &&
            player.socket &&
            player.socket.readyState ===
                WebSocket.OPEN
        ) {

            send(
                player.socket,
                data
            );
        }
    }
}

/* =====================================================
   TIEMPO RESTANTE
===================================================== */

function getRoomTimeRemaining(room) {

    if (!room) {
        return 0;
    }

    if (
        room.gameState !==
        "playing"
    ) {

        return room.timeRemaining || 0;
    }

    const remaining =
        room.matchEndTime -
        Date.now();

    return Math.max(
        0,
        remaining
    );
}

/* =====================================================
   ESTADO DE JUGADORES
===================================================== */

function sendRoomPlayers(roomCode) {

    const room =
        rooms.get(roomCode);

    if (!room) return;

    const list = [];

    for (const playerId of room.players) {

        const player =
            players.get(playerId);

        if (!player) continue;

        list.push({

            id:
                player.id,

            x:
                player.x,

            y:
                player.y,

            z:
                player.z,

            rotationX:
                player.rotationX,

            rotationY:
                player.rotationY,

            rotationZ:
                player.rotationZ,

            plane:
                player.plane,

            maxHealth:
                player.maxHealth,

            health:
                player.health,

            alive:
                player.alive,

            kills:
                player.kills,

            deaths:
                player.deaths,

            score:
                player.score,

            connected:
                player.connected
        });
    }

    for (const playerId of room.players) {

        const player =
            players.get(playerId);

        if (!player) continue;

        send(
            player.socket,
            {
                type:
                    "roomPlayers",

                room:
                    roomCode,

                players:
                    list,

                gameState:
                    room.gameState,

                timeRemaining:
                    getRoomTimeRemaining(room)
            }
        );
    }
}

/* =====================================================
   ESTADÍSTICAS
===================================================== */

function sendPlayerStats(player) {

    if (!player) return;

    send(
        player.socket,
        {
            type:
                "scoreUpdate",

            id:
                player.id,

            score:
                player.score,

            kills:
                player.kills,

            deaths:
                player.deaths
        }
    );
}

/* =====================================================
   ELIMINAR MISILES DE SALA
===================================================== */

function removeRoomMissiles(roomCode) {

    for (
        const [missileId, missile]
        of missiles
    ) {

        if (
            missile.roomCode !==
            roomCode
        ) {
            continue;
        }

        missiles.delete(
            missileId
        );

        broadcastRoom(
            roomCode,
            {
                type:
                    "missileRemoved",

                id:
                    missileId
            }
        );
    }
}

/* =====================================================
   ELIMINAR MISILES DE JUGADOR
===================================================== */

function removePlayerMissiles(playerId) {

    for (
        const [missileId, missile]
        of missiles
    ) {

        if (
            missile.ownerId !==
            playerId
        ) {
            continue;
        }

        const roomCode =
            missile.roomCode;

        missiles.delete(
            missileId
        );

        if (roomCode) {

            broadcastRoom(
                roomCode,
                {
                    type:
                        "missileRemoved",

                    id:
                        missileId
                }
            );
        }
    }
}

/* =====================================================
   REINICIAR ESTADÍSTICAS
===================================================== */

function resetPlayerStats(player) {

    if (!player) return;

    player.kills = 0;
    player.deaths = 0;
    player.score = 0;

    player.health =
        player.maxHealth;

    player.alive =
        true;
}

/* =====================================================
   CANCELAR RESPAWN
===================================================== */

function cancelRespawn(player) {

    if (!player) return;

    if (player.respawnTimer) {

        clearTimeout(
            player.respawnTimer
        );

        player.respawnTimer = null;
    }
}

/* =====================================================
   INICIAR PARTIDA
===================================================== */

function startMatch(roomCode) {

    const room =
        rooms.get(roomCode);

    if (!room) return false;

    if (
        room.players.size <
        MIN_PLAYERS_TO_START
    ) {
        return false;
    }

    if (
        room.gameState ===
        "playing"
    ) {
        return false;
    }

    if (room.matchTimer) {

        clearInterval(
            room.matchTimer
        );

        room.matchTimer = null;
    }

    removeRoomMissiles(
        roomCode
    );

    for (const playerId of room.players) {

        const player =
            players.get(playerId);

        if (!player) continue;

        cancelRespawn(player);

        resetPlayerStats(
            player
        );

        player.x = 0;
        player.y = 0;
        player.z = 0;

        player.rotationX = 0;
        player.rotationY = 0;
        player.rotationZ = 0;
    }

    room.gameState =
        "playing";

    room.matchStartTime =
        Date.now();

    room.matchEndTime =
        Date.now() +
        MATCH_DURATION;

    room.timeRemaining =
        MATCH_DURATION;

    room.matchNumber++;

    broadcastRoom(
        roomCode,
        {
            type:
                "gameStarted",

            matchNumber:
                room.matchNumber,

            duration:
                MATCH_DURATION,

            timeRemaining:
                MATCH_DURATION
        }
    );

    sendRoomPlayers(
        roomCode
    );

    room.matchTimer =
        setInterval(
            () => {

                const currentRoom =
                    rooms.get(roomCode);

                if (!currentRoom) {

                    clearInterval(
                        room.matchTimer
                    );

                    return;
                }

                if (
                    currentRoom.gameState !==
                    "playing"
                ) {

                    clearInterval(
                        currentRoom.matchTimer
                    );

                    currentRoom.matchTimer =
                        null;

                    return;
                }

                const remaining =
                    getRoomTimeRemaining(
                        currentRoom
                    );

                currentRoom.timeRemaining =
                    remaining;

                if (
                    remaining <= 0
                ) {

                    endMatch(
                        roomCode
                    );

                    return;
                }

                broadcastRoom(
                    roomCode,
                    {
                        type:
                            "matchTime",

                        timeRemaining:
                            remaining
                    }
                );

            },
            MATCH_TICK
        );

    return true;
}

/* =====================================================
   FINAL DE PARTIDA
===================================================== */

function endMatch(roomCode) {

    const room =
        rooms.get(roomCode);

    if (!room) return;

    if (
        room.gameState !==
        "playing"
    ) {
        return;
    }

    room.gameState =
        "finished";

    room.timeRemaining =
        0;

    room.matchEndTime =
        Date.now();

    if (room.matchTimer) {

        clearInterval(
            room.matchTimer
        );

        room.matchTimer =
            null;
    }

    removeRoomMissiles(
        roomCode
    );

    for (const playerId of room.players) {

        const player =
            players.get(playerId);

        if (!player) continue;

        cancelRespawn(player);
    }

    const ranking = [];

    for (const playerId of room.players) {

        const player =
            players.get(playerId);

        if (!player) continue;

        ranking.push({

            id:
                player.id,

            score:
                player.score,

            kills:
                player.kills,

            deaths:
                player.deaths,

            plane:
                player.plane
        });
    }

    ranking.sort(
        (a, b) => {

            if (
                b.score !==
                a.score
            ) {

                return b.score -
                    a.score;
            }

            if (
                b.kills !==
                a.kills
            ) {

                return b.kills -
                    a.kills;
            }

            return a.deaths -
                b.deaths;
        }
    );

    for (
        let i = 0;
        i < ranking.length;
        i++
    ) {

        ranking[i].position =
            i + 1;
    }

    broadcastRoom(
        roomCode,
        {
            type:
                "gameEnded",

            ranking:
                ranking,

            timeRemaining:
                0,

            canRestart:
                room.players.size >=
                MIN_PLAYERS_TO_START
        }
    );

    sendRoomPlayers(
        roomCode
    );
}

/* =====================================================
   RESPAWN
===================================================== */

function respawnPlayer(player) {

    if (!player) return;

    player.respawnTimer = null;

    if (
        !player.socket ||
        player.socket.readyState !==
            WebSocket.OPEN
    ) {
        return;
    }

    if (player.alive) {
        return;
    }

    if (!player.roomCode) {
        return;
    }

    const room =
        rooms.get(
            player.roomCode
        );

    if (!room) return;

    if (
        room.gameState !==
        "playing"
    ) {
        return;
    }

    player.health =
        player.maxHealth;

    player.alive =
        true;

    player.x = 0;
    player.y = 0;
    player.z = 0;

    player.rotationX = 0;
    player.rotationY = 0;
    player.rotationZ = 0;

    broadcastRoom(
        player.roomCode,
        {
            type:
                "playerRespawned",

            id:
                player.id,

            x:
                player.x,

            y:
                player.y,

            z:
                player.z,

            rotationX:
                player.rotationX,

            rotationY:
                player.rotationY,

            rotationZ:
                player.rotationZ,

            maxHealth:
                player.maxHealth,

            health:
                player.health,

            alive:
                player.alive,

            kills:
                player.kills,

            deaths:
                player.deaths,

            score:
                player.score
        }
    );

    sendRoomPlayers(
        player.roomCode
    );
}

/* =====================================================
   PROGRAMAR RESPAWN
===================================================== */

function scheduleRespawn(player) {

    if (!player) return;

    if (player.respawnTimer) {
        return;
    }

    player.respawnTimer =
        setTimeout(
            () => {

                player.respawnTimer =
                    null;

                respawnPlayer(
                    player
                );

            },
            RESPAWN_TIME
        );
}

/* =====================================================
   REGISTRAR KILL
===================================================== */

function registerKill(
    attackerId,
    victimId
) {

    const attacker =
        players.get(
            attackerId
        );

    const victim =
        players.get(
            victimId
        );

    if (victim) {

        victim.deaths++;
    }

    if (
        attacker &&
        attacker.id !== victimId
    ) {

        attacker.kills++;

        attacker.score =
            Math.min(
                MAX_SCORE,
                attacker.score +
                KILL_SCORE
            );
    }

    if (attacker) {

        sendPlayerStats(
            attacker
        );
    }

    if (victim) {

        sendPlayerStats(
            victim
        );
    }

    if (
        victim &&
        victim.roomCode
    ) {

        broadcastRoom(
            victim.roomCode,
            {
                type:
                    "killConfirmed",

                attackerId:
                    attacker
                        ? attacker.id
                        : null,

                victimId:
                    victim.id,

                attackerKills:
                    attacker
                        ? attacker.kills
                        : null,

                attackerScore:
                    attacker
                        ? attacker.score
                        : null,

                victimDeaths:
                    victim.deaths
            }
        );
    }
}

/* =====================================================
   ELIMINAR JUGADOR DE SALA
===================================================== */

function removeFromRoom(player) {

    if (!player.roomCode) {
        return;
    }

    const roomCode =
        player.roomCode;

    const room =
        rooms.get(roomCode);

    if (!room) {

        player.roomCode =
            null;

        return;
    }

    cancelRespawn(player);

    removePlayerMissiles(
        player.id
    );

    room.players.delete(
        player.id
    );

    broadcastRoom(
        roomCode,
        {
            type:
                "playerLeft",

            id:
                player.id
        },
        player.id
    );

    if (
        room.host === player.id &&
        room.players.size > 0
    ) {

        const newHost =
            room.players
                .values()
                .next()
                .value;

        room.host =
            newHost;

        const newHostPlayer =
            players.get(
                newHost
            );

        if (newHostPlayer) {

            send(
                newHostPlayer.socket,
                {
                    type:
                        "roomHost",

                    room:
                        roomCode
                }
            );
        }
    }

    if (
        room.gameState ===
            "playing" &&
        room.players.size <
            MIN_PLAYERS_TO_START
    ) {

        if (room.matchTimer) {

            clearInterval(
                room.matchTimer
            );

            room.matchTimer =
                null;
        }

        room.gameState =
            "waiting";

        room.timeRemaining =
            MATCH_DURATION;

        room.matchStartTime =
            null;

        room.matchEndTime =
            null;

        removeRoomMissiles(
            roomCode
        );

        broadcastRoom(
            roomCode,
            {
                type:
                    "gameWaiting",

                reason:
                    "No hay suficientes jugadores."
            }
        );
    }

    if (
        room.players.size ===
        0
    ) {

        if (room.matchTimer) {

            clearInterval(
                room.matchTimer
            );

            room.matchTimer =
                null;
        }

        removeRoomMissiles(
            roomCode
        );

        rooms.delete(
            roomCode
        );

    } else {

        sendRoomPlayers(
            roomCode
        );
    }

    player.roomCode =
        null;
}

/* =====================================================
   DESCONEXIÓN TEMPORAL
===================================================== */

function temporarilyDisconnectPlayer(player) {

    if (!player) return;

    player.connected = false;

    if (player.socket) {
        player.socket = null;
    }

    if (player.reconnectTimer) {

        clearTimeout(
            player.reconnectTimer
        );
    }

    player.reconnectTimer =
        setTimeout(
            () => {

                if (
                    player.connected
                ) {
                    return;
                }

                if (
                    player.roomCode
                ) {

                    removeFromRoom(
                        player
                    );
                }

                players.delete(
                    player.id
                );

            },
            RECONNECT_GRACE_TIME
        );

    if (player.roomCode) {

        broadcastRoom(
            player.roomCode,
            {
                type:
                    "playerDisconnected",

                id:
                    player.id
            },
            player.id
        );
    }
}

/* =====================================================
   RECONEXIÓN
===================================================== */

function reconnectPlayer(
    socket,
    oldPlayer,
    data
) {

    if (!oldPlayer) {

        send(
            socket,
            {
                type:
                    "reconnectError",

                message:
                    "No se encontró la sesión."
            }
        );

        return false;
    }

    if (
        oldPlayer.connected
    ) {

        send(
            socket,
            {
                type:
                    "reconnectError",

                message:
                    "La sesión ya está conectada."
            }
        );

        return false;
    }

    if (
        oldPlayer.reconnectToken !==
        String(
            data.reconnectToken || ""
        )
    ) {

        send(
            socket,
            {
                type:
                    "reconnectError",

                message:
                    "Token de reconexión inválido."
            }
        );

        return false;
    }

    if (oldPlayer.reconnectTimer) {

        clearTimeout(
            oldPlayer.reconnectTimer
        );

        oldPlayer.reconnectTimer =
            null;
    }

    oldPlayer.socket =
        socket;

    oldPlayer.connected =
        true;

    send(
        socket,
        {
            type:
                "reconnected",

            id:
                oldPlayer.id,

            room:
                oldPlayer.roomCode,

            reconnectToken:
                oldPlayer.reconnectToken,

            maxHealth:
                oldPlayer.maxHealth,

            health:
                oldPlayer.health,

            alive:
                oldPlayer.alive,

            kills:
                oldPlayer.kills,

            deaths:
                oldPlayer.deaths,

            score:
                oldPlayer.score
        }
    );

    if (oldPlayer.roomCode) {

        broadcastRoom(
            oldPlayer.roomCode,
            {
                type:
                    "playerReconnected",

                id:
                    oldPlayer.id
            },
            oldPlayer.id
        );

        sendRoomPlayers(
            oldPlayer.roomCode
        );
    }

    return true;
}

/* =====================================================
   CREAR SALA
===================================================== */

function createRoomForPlayer(player) {

    removeFromRoom(
        player
    );

    const code =
        createRoomCode();

    const room = {

        code:
            code,

        host:
            player.id,

        players:
            new Set(),

        gameState:
            "waiting",

        matchStartTime:
            null,

        matchEndTime:
            null,

        timeRemaining:
            MATCH_DURATION,

        matchTimer:
            null,

        matchNumber:
            0
    };

    room.players.add(
        player.id
    );

    rooms.set(
        code,
        room
    );

    player.roomCode =
        code;

    player.health =
        player.maxHealth;

    player.alive =
        true;

    send(
        player.socket,
        {
            type:
                "roomCreated",

            room:
                code,

            host:
                true
        }
    );

    sendRoomPlayers(
        code
    );
}

/* =====================================================
   UNIRSE A SALA
===================================================== */

function joinRoom(
    player,
    requestedCode
) {

    const code =
        String(
            requestedCode || ""
        )
        .trim()
        .toUpperCase();

    if (!code) {

        send(
            player.socket,
            {
                type:
                    "roomError",

                message:
                    "Tenés que ingresar un código."
            }
        );

        return;
    }

    const room =
        rooms.get(code);

    if (!room) {

        send(
            player.socket,
            {
                type:
                    "roomError",

                message:
                    "La sala no existe."
            }
        );

        return;
    }

    if (
        room.players.size >=
        MAX_PLAYERS_PER_ROOM
    ) {

        send(
            player.socket,
            {
                type:
                    "roomError",

                message:
                    "La sala está llena."
            }
        );

        return;
    }

    if (
        room.gameState ===
        "playing"
    ) {

        send(
            player.socket,
            {
                type:
                    "roomError",

                message:
                    "La partida ya comenzó."
            }
        );

        return;
    }

    removeFromRoom(
        player
    );

    player.roomCode =
        code;

    room.players.add(
        player.id
    );

    player.health =
        player.maxHealth;

    player.alive =
        true;

    send(
        player.socket,
        {
            type:
                "roomJoined",

            room:
                code,

            host:
                room.host ===
                player.id,

            gameState:
                room.gameState
        }
    );

    broadcastRoom(
        code,
        {
            type:
                "playerJoined",

            id:
                player.id,

            plane:
                player.plane
        },
        player.id
    );

    sendRoomPlayers(
        code
    );

    if (
        room.players.size >=
        MIN_PLAYERS_TO_START
    ) {

        startMatch(
            code
        );
    }
}

/* =====================================================
   BUSCAR PARTIDA AL AZAR
===================================================== */

function findPublicRoom(player) {

    for (
        const [code, room]
        of rooms
    ) {

        if (
            room.players.size > 0 &&
            room.players.size <
                MAX_PLAYERS_PER_ROOM &&
            room.gameState !==
                "playing"
        ) {

            joinRoom(
                player,
                code
            );

            return;
        }
    }

    createRoomForPlayer(
        player
    );

    send(
        player.socket,
        {
            type:
                "publicMatchCreated",

            room:
                player.roomCode
        }
    );
}

/* =====================================================
   CREAR MISIL
===================================================== */

function fireMissile(
    player,
    data
) {

    if (!player.roomCode) {
        return;
    }

    if (!player.alive) {
        return;
    }

    const room =
        rooms.get(
            player.roomCode
        );

    if (!room) {
        return;
    }

    if (
        room.gameState !==
        "playing"
    ) {
        return;
    }

    const x =
        Number(data.x);

    const y =
        Number(data.y);

    const z =
        Number(data.z);

    let velocityX =
        Number(data.velocityX);

    let velocityY =
        Number(data.velocityY);

    let velocityZ =
        Number(data.velocityZ);

    if (
        !isValidVector(
            x,
            y,
            z
        )
    ) {
        return;
    }

    if (
        !Number.isFinite(
            velocityX
        ) ||
        !Number.isFinite(
            velocityY
        ) ||
        !Number.isFinite(
            velocityZ
        )
    ) {
        return;
    }

    const length =
        Math.sqrt(
            velocityX * velocityX +
            velocityY * velocityY +
            velocityZ * velocityZ
        );

    if (
        !Number.isFinite(length) ||
        length <= 0
    ) {
        return;
    }

    velocityX =
        (velocityX / length) *
        MISSILE_SPEED;

    velocityY =
        (velocityY / length) *
        MISSILE_SPEED;

    velocityZ =
        (velocityZ / length) *
        MISSILE_SPEED;

    const missileId =
        createMissileId();

    const missile = {

        id:
            missileId,

        ownerId:
            player.id,

        roomCode:
            player.roomCode,

        x:
            x,

        y:
            y,

        z:
            z,

        velocityX:
            velocityX,

        velocityY:
            velocityY,

        velocityZ:
            velocityZ,

        createdAt:
            Date.now()
    };

    missiles.set(
        missileId,
        missile
    );

    broadcastRoom(
        player.roomCode,
        {
            type:
                "missileCreated",

            id:
                missile.id,

            ownerId:
                missile.ownerId,

            x:
                missile.x,

            y:
                missile.y,

            z:
                missile.z,

            velocityX:
                missile.velocityX,

            velocityY:
                missile.velocityY,

            velocityZ:
                missile.velocityZ
        }
    );
}

/* =====================================================
   ELIMINAR MISIL
===================================================== */

function removeMissile(
    missileId,
    roomCode
) {

    const missile =
        missiles.get(
            missileId
        );

    if (!missile) {
        return;
    }

    missiles.delete(
        missileId
    );

    broadcastRoom(
        roomCode,
        {
            type:
                "missileRemoved",

            id:
                missileId
        }
    );
}

/* =====================================================
   APLICAR DAÑO
===================================================== */

function applyDamage(
    target,
    damage,
    attackerId,
    missileId
) {

    if (!target) {
        return false;
    }

    if (!target.alive) {
        return false;
    }

    if (!target.roomCode) {
        return false;
    }

    const room =
        rooms.get(
            target.roomCode
        );

    if (!room) {
        return false;
    }

    if (
        room.gameState !==
        "playing"
    ) {
        return false;
    }

    let finalDamage =
        Number(damage);

    if (
        !Number.isFinite(
            finalDamage
        )
    ) {
        return false;
    }

    finalDamage =
        Math.max(
            0,
            Math.min(
                MAX_HEALTH,
                finalDamage
            )
        );

    target.health -=
        finalDamage;

    if (
        target.health < 0
    ) {

        target.health =
            0;
    }

    broadcastRoom(
        target.roomCode,
        {
            type:
                "playerDamaged",

            id:
                target.id,

            attackerId:
                attackerId,

            missileId:
                missileId,

            damage:
                finalDamage,

            health:
                target.health,

            maxHealth:
                target.maxHealth,

            alive:
                target.alive,

            kills:
                target.kills,

            deaths:
                target.deaths,

            score:
                target.score
        }
    );

    if (
        target.health <= 0
    ) {

        target.health =
            0;

        target.alive =
            false;

        removePlayerMissiles(
            target.id
        );

        registerKill(
            attackerId,
            target.id
        );

        broadcastRoom(
            target.roomCode,
            {
                type:
                    "playerDestroyed",

                id:
                    target.id,

                attackerId:
                    attackerId,

                missileId:
                    missileId,

                kills:
                    target.kills,

                deaths:
                    target.deaths,

                score:
                    target.score
            }
        );

        scheduleRespawn(
            target
        );
    }

    return true;
}

/* =====================================================
   COLISIÓN DEL MISIL
===================================================== */

function checkMissileCollision(
    missile
) {

    const room =
        rooms.get(
            missile.roomCode
        );

    if (!room) {
        return false;
    }

    if (
        room.gameState !==
        "playing"
    ) {
        return false;
    }

    for (
        const playerId
        of room.players
    ) {

        if (
            playerId ===
            missile.ownerId
        ) {
            continue;
        }

        const target =
            players.get(
                playerId
            );

        if (!target) {
            continue;
        }

        if (!target.alive) {
            continue;
        }

        const dx =
            missile.x -
            target.x;

        const dy =
            missile.y -
            target.y;

        const dz =
            missile.z -
            target.z;

        const distanceSquared =
            dx * dx +
            dy * dy +
            dz * dz;

        const hitDistanceSquared =
            MISSILE_HIT_DISTANCE *
            MISSILE_HIT_DISTANCE;

        if (
            distanceSquared <=
            hitDistanceSquared
        ) {

            applyDamage(
                target,
                MISSILE_DAMAGE,
                missile.ownerId,
                missile.id
            );

            broadcastRoom(
                missile.roomCode,
                {
                    type:
                        "missileHit",

                    missileId:
                        missile.id,

                    attackerId:
                        missile.ownerId,

                    targetId:
                        target.id,

                    damage:
                        MISSILE_DAMAGE
                }
            );

            removeMissile(
                missile.id,
                missile.roomCode
            );

            return true;
        }
    }

    return false;
}

/* =====================================================
   ACTUALIZAR MISILES
===================================================== */

function updateMissiles() {

    const now =
        Date.now();

    for (
        const [missileId, missile]
        of missiles
    ) {

        const room =
            rooms.get(
                missile.roomCode
            );

        if (
            !room ||
            room.gameState !==
                "playing"
        ) {

            removeMissile(
                missileId,
                missile.roomCode
            );

            continue;
        }

        missile.x +=
            missile.velocityX;

        missile.y +=
            missile.velocityY;

        missile.z +=
            missile.velocityZ;

        const hit =
            checkMissileCollision(
                missile
            );

        if (hit) {
            continue;
        }

        if (
            now -
            missile.createdAt >=
            MISSILE_LIFETIME
        ) {

            removeMissile(
                missileId,
                missile.roomCode
            );

            continue;
        }

        broadcastRoom(
            missile.roomCode,
            {
                type:
                    "missileUpdate",

                id:
                    missile.id,

                x:
                    missile.x,

                y:
                    missile.y,

                z:
                    missile.z
            }
        );
    }
}

setInterval(
    updateMissiles,
    50
);

/* =====================================================
   CONEXIONES
===================================================== */

server.on(
    "connection",
    socket => {

        let currentPlayer = null;

        /* =================================================
           CREAR / RECONEXIÓN
        ================================================= */

        function handleConnectionMessage(raw) {

            if (
                raw.length >
                MAX_MESSAGE_SIZE
            ) {

                send(
                    socket,
                    {
                        type:
                            "error",

                        message:
                            "Mensaje demasiado grande."
                    }
                );

                return;
            }

            let data;

            try {

                data =
                    JSON.parse(
                        raw.toString()
                    );

            } catch (error) {

                send(
                    socket,
                    {
                        type:
                            "error",

                        message:
                            "Mensaje inválido."
                    }
                );

                return;
            }

            if (
                !data ||
                typeof data !==
                    "object"
            ) {
                return;
            }

            /* =============================================
               RECONEXIÓN
            ============================================= */

            if (
                data.type ===
                "reconnect"
            ) {

                const reconnectId =
                    String(
                        data.id || ""
                    );

                const oldPlayer =
                    players.get(
                        reconnectId
                    );

                const success =
                    reconnectPlayer(
                        socket,
                        oldPlayer,
                        data
                    );

                if (success) {

                    currentPlayer =
                        oldPlayer;
                }

                return;
            }

            /* =============================================
               CREAR NUEVO JUGADOR
            ============================================= */

            if (!currentPlayer) {

                const id =
                    createId();

                currentPlayer = {

                    id:
                        id,

                    socket:
                        socket,

                    roomCode:
                        null,

                    x:
                        0,

                    y:
                        0,

                    z:
                        0,

                    rotationX:
                        0,

                    rotationY:
                        0,

                    rotationZ:
                        0,

                    plane:
                        0,

                    maxHealth:
                        MAX_HEALTH,

                    health:
                        MAX_HEALTH,

                    alive:
                        true,

                    kills:
                        0,

                    deaths:
                        0,

                    score:
                        0,

                    respawnTimer:
                        null,

                    reconnectToken:
                        createReconnectToken(),

                    reconnectTimer:
                        null,

                    connected:
                        true
                };

                players.set(
                    id,
                    currentPlayer
                );

                send(
                    socket,
                    {
                        type:
                            "welcome",

                        id:
                            id,

                        reconnectToken:
                            currentPlayer.reconnectToken,

                        maxHealth:
                            currentPlayer.maxHealth,

                        health:
                            currentPlayer.health,

                        alive:
                            currentPlayer.alive,

                        kills:
                            currentPlayer.kills,

                        deaths:
                            currentPlayer.deaths,

                        score:
                            currentPlayer.score
                    }
                );
            }

            const player =
                currentPlayer;

            /* =============================================
               CREAR SALA
            ============================================= */

            if (
                data.type ===
                "createRoom"
            ) {

                if (
                    data.plane !==
                        undefined &&
                    !isValidPlane(
                        data.plane
                    )
                ) {
                    return;
                }

                if (
                    Number.isInteger(
                        data.plane
                    )
                ) {

                    player.plane =
                        data.plane;
                }

                createRoomForPlayer(
                    player
                );

                return;
            }

            /* =============================================
               UNIRSE POR CÓDIGO
            ============================================= */

            if (
                data.type ===
                "joinRoom"
            ) {

                if (
                    typeof data.room !==
                    "string"
                ) {
                    return;
                }

                if (
                    data.plane !==
                        undefined &&
                    !isValidPlane(
                        data.plane
                    )
                ) {
                    return;
                }

                if (
                    Number.isInteger(
                        data.plane
                    )
                ) {

                    player.plane =
                        data.plane;
                }

                joinRoom(
                    player,
                    data.room
                );

                return;
            }

            /* =============================================
               PARTIDA AL AZAR
            ============================================= */

            if (
                data.type ===
                "findMatch"
            ) {

                if (
                    data.plane !==
                        undefined &&
                    !isValidPlane(
                        data.plane
                    )
                ) {
                    return;
                }

                if (
                    Number.isInteger(
                        data.plane
                    )
                ) {

                    player.plane =
                        data.plane;
                }

                findPublicRoom(
                    player
                );

                return;
            }

            /* =============================================
               SALIR DE SALA
            ============================================= */

            if (
                data.type ===
                "leaveRoom"
            ) {

                const oldRoom =
                    player.roomCode;

                removeFromRoom(
                    player
                );

                send(
                    socket,
                    {
                        type:
                            "leftRoom",

                        room:
                            oldRoom
                    }
                );

                return;
            }

            /* =============================================
               ENTRAR AL MULTIJUGADOR
            ============================================= */

            if (
                data.type ===
                "join"
            ) {

                if (
                    data.plane !==
                        undefined &&
                    !isValidPlane(
                        data.plane
                    )
                ) {
                    return;
                }

                if (
                    Number.isInteger(
                        data.plane
                    )
                ) {

                    player.plane =
                        data.plane;
                }

                if (
                    !player.roomCode
                ) {

                    findPublicRoom(
                        player
                    );

                    return;
                }

                broadcastRoom(
                    player.roomCode,
                    {
                        type:
                            "playerJoined",

                        id:
                            player.id,

                        plane:
                            player.plane
                    },
                    player.id
                );

                sendRoomPlayers(
                    player.roomCode
                );

                return;
            }

            /* =============================================
               ACTUALIZAR AVIÓN
            ============================================= */

            if (
                data.type ===
                "playerUpdate"
            ) {

                const x =
                    Number(data.x);

                const y =
                    Number(data.y);

                const z =
                    Number(data.z);

                if (
                    !isValidVector(
                        x,
                        y,
                        z
                    )
                ) {
                    return;
                }

                player.x =
                    x;

                player.y =
                    y;

                player.z =
                    z;

                player.rotationX =
                    safeNumber(
                        data.rotationX,
                        -1000,
                        1000,
                        0
                    );

                player.rotationY =
                    safeNumber(
                        data.rotationY,
                        -1000,
                        1000,
                        0
                    );

                player.rotationZ =
                    safeNumber(
                        data.rotationZ,
                        -1000,
                        1000,
                        0
                    );

                if (
                    data.plane !==
                        undefined &&
                    isValidPlane(
                        data.plane
                    )
                ) {

                    player.plane =
                        data.plane;
                }

                if (
                    !player.roomCode
                ) {
                    return;
                }

                broadcastRoom(
                    player.roomCode,
                    {
                        type:
                            "playerUpdate",

                        id:
                            player.id,

                        x:
                            player.x,

                        y:
                            player.y,

                        z:
                            player.z,

                        rotationX:
                            player.rotationX,

                        rotationY:
                            player.rotationY,

                        rotationZ:
                            player.rotationZ,

                        plane:
                            player.plane,

                        maxHealth:
                            player.maxHealth,

                        health:
                            player.health,

                        alive:
                            player.alive,

                        kills:
                            player.kills,

                        deaths:
                            player.deaths,

                        score:
                            player.score
                    },
                    player.id
                );

                return;
            }

            /* =============================================
               DAÑO DIRECTO
            ============================================= */

            if (
                data.type ===
                "damagePlayer"
            ) {

                if (
                    !player.roomCode ||
                    !player.alive
                ) {
                    return;
                }

                const room =
                    rooms.get(
                        player.roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    room.gameState !==
                    "playing"
                ) {
                    return;
                }

                let damage =
                    Number(
                        data.damage
                    );

                if (
                    !Number.isFinite(
                        damage
                    )
                ) {
                    return;
                }

                damage =
                    Math.max(
                        0,
                        Math.min(
                            MAX_HEALTH,
                            damage
                        )
                    );

                let attackerId =
                    null;

                if (
                    typeof data.attackerId ===
                    "string" &&
                    players.has(
                        data.attackerId
                    )
                ) {

                    attackerId =
                        data.attackerId;
                }

                applyDamage(
                    player,
                    damage,
                    attackerId,
                    data.missileId ||
                        null
                );

                return;
            }

            /* =============================================
               DISPARAR MISIL
            ============================================= */

            if (
                data.type ===
                "fireMissile"
            ) {

                fireMissile(
                    player,
                    data
                );

                return;
            }

            /* =============================================
               ELIMINAR MISIL
            ============================================= */

            if (
                data.type ===
                "removeMissile"
            ) {

                const missileId =
                    String(
                        data.id || ""
                    );

                const missile =
                    missiles.get(
                        missileId
                    );

                if (!missile) {
                    return;
                }

                if (
                    missile.ownerId !==
                    player.id
                ) {
                    return;
                }

                removeMissile(
                    missileId,
                    missile.roomCode
                );

                return;
            }

            /* =============================================
               INICIAR / REINICIAR PARTIDA
            ============================================= */

            if (
                data.type ===
                "startMatch"
            ) {

                if (
                    !player.roomCode
                ) {
                    return;
                }

                const room =
                    rooms.get(
                        player.roomCode
                    );

                if (!room) {
                    return;
                }

                if (
                    room.host !==
                    player.id
                ) {

                    send(
                        socket,
                        {
                            type:
                                "roomError",

                            message:
                                "Solo el creador puede iniciar la partida."
                        }
                    );

                    return;
                }

                if (
                    room.gameState ===
                    "playing"
                ) {

                    send(
                        socket,
                        {
                            type:
                                "roomError",

                            message:
                                "La partida ya está en curso."
                        }
                    );

                    return;
                }

                if (
                    room.players.size <
                    MIN_PLAYERS_TO_START
                ) {

                    send(
                        socket,
                        {
                            type:
                                "roomError",

                            message:
                                "Se necesitan al menos 2 jugadores."
                        }
                    );

                    return;
                }

                startMatch(
                    player.roomCode
                );

                return;
            }
        }

        /* =================================================
           ÚNICO LISTENER DE MENSAJES
        ================================================= */

        socket.on(
            "message",
            handleConnectionMessage
        );

        /* =================================================
           CERRAR CONEXIÓN
        ================================================= */

        socket.on(
            "close",
            () => {

                if (!currentPlayer) {
                    return;
                }

                temporarilyDisconnectPlayer(
                    currentPlayer
                );

                currentPlayer =
                    null;
            }
        );

        socket.on(
            "error",
            () => {

                if (!currentPlayer) {
                    return;
                }

                temporarilyDisconnectPlayer(
                    currentPlayer
                );

                currentPlayer =
                    null;
            }
        );
    }
);

/* =====================================================
   LIMPIEZA DE SALAS
===================================================== */

setInterval(
    () => {

        for (
            const [roomCode, room]
            of rooms
        ) {

            if (
                room.players.size ===
                0
            ) {

                if (
                    room.matchTimer
                ) {

                    clearInterval(
                        room.matchTimer
                    );
                }

                rooms.delete(
                    roomCode
                );
            }
        }

    },
    30000
);

/* =====================================================
   INICIAR SERVIDOR
===================================================== */

httpServer.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `✈️ AIR FLIGHT SERVER ONLINE - PORT ${PORT}`
        );

        console.log(
            `👥 WebSocket listo`
        );

        console.log(
            `❤️ Sistema de vida listo`
        );

        console.log(
            `🚀 Sistema de misiles listo`
        );

        console.log(
            `💥 Colisiones de misiles listas`
        );

        console.log(
            `🔄 Sistema de respawn listo`
        );

        console.log(
            `🏆 Sistema de kills listo`
        );

        console.log(
            `☠️ Sistema de muertes listo`
        );

        console.log(
            `⭐ Sistema de puntuación listo`
        );

        console.log(
            `⏱️ Temporizador de partida listo`
        );

        console.log(
            `🏁 Final de partida listo`
        );

        console.log(
            `🔒 Validación del servidor lista`
        );

        console.log(
            `🔄 Sistema de reconexión listo`
        );

        console.log(
            `🎮 Estado de partida listo`
        );

        console.log(
            `🔁 Reinicio de partidas listo`
        );
    }
);