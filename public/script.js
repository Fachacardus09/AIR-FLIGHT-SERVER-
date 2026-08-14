/* =========================================================
   AIR FLIGHT
   CLIENTE MULTIJUGADOR
   Conectado con server.js
========================================================= */

"use strict";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const AIR_FLIGHT = {

    socket: null,

    connected: false,

    connecting: false,

    reconnecting: false,

    reconnectAttempts: 0,

    reconnectTimer: null,

    reconnectDelay: 2000,

    maxReconnectDelay: 10000,

    id: null,

    reconnectToken: null,

    room: null,

    isHost: false,

    gameState: "waiting",

    matchNumber: 0,

    timeRemaining: 0,

    maxHealth: 100,

    health: 100,

    alive: true,

    kills: 0,

    deaths: 0,

    score: 0,

    plane: 0,

    players: new Map(),

    missiles: new Map(),

    position: {

        x: 0,
        y: 0,
        z: 0

    },

    rotation: {

        x: 0,
        y: 0,
        z: 0

    },

    lastPositionSent: 0,

    positionSendInterval: 50,

    intentionalClose: false

};


/* =========================================================
   UTILIDADES
========================================================= */

function log(...args) {

    console.log(
        "[AIR FLIGHT]",
        ...args
    );

}


function warn(...args) {

    console.warn(
        "[AIR FLIGHT]",
        ...args
    );

}


function error(...args) {

    console.error(
        "[AIR FLIGHT]",
        ...args
    );

}


/* =========================================================
   CREAR URL WEBSOCKET
========================================================= */

function getWebSocketURL() {

    const protocol =
        location.protocol === "https:"
            ? "wss:"
            : "ws:";

    return (
        protocol +
        "//" +
        location.host
    );

}


/* =========================================================
   CONEXIÓN
========================================================= */

function connectToServer() {

    if (
        AIR_FLIGHT.connected ||
        AIR_FLIGHT.connecting
    ) {

        return;

    }

    AIR_FLIGHT.connecting = true;

    AIR_FLIGHT.intentionalClose = false;

    log(
        "Conectando a:",
        getWebSocketURL()
    );

    try {

        AIR_FLIGHT.socket =
            new WebSocket(
                getWebSocketURL()
            );

    } catch (err) {

        AIR_FLIGHT.connecting = false;

        error(
            "No se pudo crear WebSocket:",
            err
        );

        scheduleReconnect();

        return;

    }

    setupSocketEvents();

}


/* =========================================================
   EVENTOS DEL SOCKET
========================================================= */

function setupSocketEvents() {

    const socket =
        AIR_FLIGHT.socket;

    if (!socket) {
        return;
    }


    socket.addEventListener(
        "open",
        handleSocketOpen
    );


    socket.addEventListener(
        "message",
        handleSocketMessage
    );


    socket.addEventListener(
        "close",
        handleSocketClose
    );


    socket.addEventListener(
        "error",
        handleSocketError
    );

}


/* =========================================================
   SOCKET ABIERTO
========================================================= */

function handleSocketOpen() {

    AIR_FLIGHT.connected = true;

    AIR_FLIGHT.connecting = false;

    AIR_FLIGHT.reconnectAttempts = 0;

    log(
        "✈️ Conectado al servidor"
    );


    /*
       Si teníamos una sesión anterior,
       intentamos reconectarla.
    */

    if (
        AIR_FLIGHT.id &&
        AIR_FLIGHT.reconnectToken
    ) {

        sendReconnect();

    }

}


/* =========================================================
   SOCKET CERRADO
========================================================= */

function handleSocketClose() {

    AIR_FLIGHT.connected = false;

    AIR_FLIGHT.connecting = false;

    log(
        "❌ Conexión cerrada"
    );


    if (
        !AIR_FLIGHT.intentionalClose
    ) {

        scheduleReconnect();

    }

}


/* =========================================================
   ERROR
========================================================= */

function handleSocketError(event) {

    error(
        "Error WebSocket:",
        event
    );

}


/* =========================================================
   RECONEXIÓN AUTOMÁTICA
========================================================= */

function scheduleReconnect() {

    if (
        AIR_FLIGHT.reconnectTimer
    ) {

        return;

    }


    if (
        AIR_FLIGHT.intentionalClose
    ) {

        return;

    }


    AIR_FLIGHT.reconnectAttempts++;


    const delay =
        Math.min(
            AIR_FLIGHT.reconnectDelay *
            AIR_FLIGHT.reconnectAttempts,

            AIR_FLIGHT.maxReconnectDelay
        );


    log(
        "Intentando reconectar en",
        delay,
        "ms"
    );


    AIR_FLIGHT.reconnectTimer =
        setTimeout(
            () => {

                AIR_FLIGHT.reconnectTimer =
                    null;

                connectToServer();

            },
            delay
        );

}


/* =========================================================
   ENVIAR MENSAJE
========================================================= */

function sendMessage(data) {

    if (
        !AIR_FLIGHT.socket ||
        AIR_FLIGHT.socket.readyState !==
            WebSocket.OPEN
    ) {

        warn(
            "No se puede enviar. Socket cerrado."
        );

        return false;

    }


    try {

        AIR_FLIGHT.socket.send(
            JSON.stringify(data)
        );

        return true;

    } catch (err) {

        error(
            "Error enviando mensaje:",
            err
        );

        return false;

    }

}


/* =========================================================
   RECONEXIÓN DE SESIÓN
========================================================= */

function sendReconnect() {

    if (
        !AIR_FLIGHT.id ||
        !AIR_FLIGHT.reconnectToken
    ) {

        return;

    }


    sendMessage({

        type:
            "reconnect",

        id:
            AIR_FLIGHT.id,

        reconnectToken:
            AIR_FLIGHT.reconnectToken

    });

}


/* =========================================================
   MENSAJES RECIBIDOS
========================================================= */

function handleSocketMessage(event) {

    let data;

    try {

        data =
            JSON.parse(
                event.data
            );

    } catch (err) {

        error(
            "Mensaje inválido del servidor"
        );

        return;

    }


    if (
        !data ||
        typeof data !== "object"
    ) {

        return;

    }


    log(
        "📡 Servidor:",
        data
    );


    handleServerMessage(data);

}


/* =========================================================
   ROUTER DE MENSAJES
========================================================= */

function handleServerMessage(data) {

    switch (data.type) {

        case "welcome":
            handleWelcome(data);
            break;


        case "reconnected":
            handleReconnected(data);
            break;


        case "reconnectError":
            handleReconnectError(data);
            break;


        case "roomCreated":
            handleRoomCreated(data);
            break;


        case "roomJoined":
            handleRoomJoined(data);
            break;


        case "roomError":
            handleRoomError(data);
            break;


        case "publicMatchCreated":
            handlePublicMatchCreated(data);
            break;


        case "roomPlayers":
            handleRoomPlayers(data);
            break;


        case "roomHost":
            handleRoomHost(data);
            break;


        case "playerJoined":
            handlePlayerJoined(data);
            break;


        case "playerLeft":
            handlePlayerLeft(data);
            break;


        case "playerDisconnected":
            handlePlayerDisconnected(data);
            break;


        case "playerReconnected":
            handlePlayerReconnected(data);
            break;


        case "playerUpdate":
            handlePlayerUpdate(data);
            break;


        case "gameStarted":
            handleGameStarted(data);
            break;


        case "gameWaiting":
            handleGameWaiting(data);
            break;


        case "matchTime":
            handleMatchTime(data);
            break;


        case "gameEnded":
            handleGameEnded(data);
            break;


        case "playerDamaged":
            handlePlayerDamaged(data);
            break;


        case "playerDestroyed":
            handlePlayerDestroyed(data);
            break;


        case "playerRespawned":
            handlePlayerRespawned(data);
            break;


        case "scoreUpdate":
            handleScoreUpdate(data);
            break;


        case "killConfirmed":
            handleKillConfirmed(data);
            break;


        case "missileCreated":
            handleMissileCreated(data);
            break;


        case "missileUpdate":
            handleMissileUpdate(data);
            break;


        case "missileHit":
            handleMissileHit(data);
            break;


        case "missileRemoved":
            handleMissileRemoved(data);
            break;


        case "leftRoom":
            handleLeftRoom(data);
            break;


        case "error":
            handleServerError(data);
            break;


        default:

            warn(
                "Mensaje no reconocido:",
                data.type
            );

            break;

    }

}


/* =========================================================
   WELCOME
========================================================= */

function handleWelcome(data) {

    AIR_FLIGHT.id =
        data.id || null;

    AIR_FLIGHT.reconnectToken =
        data.reconnectToken || null;

    updateLocalStats(data);

    log(
        "👤 ID:",
        AIR_FLIGHT.id
    );

    log(
        "🔑 Token de reconexión recibido"
    );


    saveSession();

}


/* =========================================================
   RECONNECTED
========================================================= */

function handleReconnected(data) {

    AIR_FLIGHT.id =
        data.id || AIR_FLIGHT.id;

    AIR_FLIGHT.reconnectToken =
        data.reconnectToken ||
        AIR_FLIGHT.reconnectToken;

    AIR_FLIGHT.room =
        data.room || null;

    updateLocalStats(data);

    AIR_FLIGHT.reconnecting =
        false;

    AIR_FLIGHT.connected =
        true;

    saveSession();


    log(
        "🔄 Sesión reconectada"
    );


    if (
        AIR_FLIGHT.room
    ) {

        requestRoomState();

    }

}


/* =========================================================
   ERROR DE RECONEXIÓN
========================================================= */

function handleReconnectError(data) {

    warn(
        "Reconexión rechazada:",
        data.message
    );


    /*
       La sesión ya no puede recuperarse.
       Creamos una nueva sesión.
    */

    clearSession();

    AIR_FLIGHT.id = null;

    AIR_FLIGHT.reconnectToken = null;

}


/* =========================================================
   ESTADÍSTICAS LOCALES
========================================================= */

function updateLocalStats(data) {

    if (
        data.maxHealth !== undefined
    ) {

        AIR_FLIGHT.maxHealth =
            Number(data.maxHealth);

    }


    if (
        data.health !== undefined
    ) {

        AIR_FLIGHT.health =
            Number(data.health);

    }


    if (
        data.alive !== undefined
    ) {

        AIR_FLIGHT.alive =
            Boolean(data.alive);

    }


    if (
        data.kills !== undefined
    ) {

        AIR_FLIGHT.kills =
            Number(data.kills);

    }


    if (
        data.deaths !== undefined
    ) {

        AIR_FLIGHT.deaths =
            Number(data.deaths);

    }


    if (
        data.score !== undefined
    ) {

        AIR_FLIGHT.score =
            Number(data.score);

    }


    updateHUD();

}


/* =========================================================
   CREAR SALA
========================================================= */

function createRoom(plane = AIR_FLIGHT.plane) {

    sendMessage({

        type:
            "createRoom",

        plane:
            plane

    });

}


/* =========================================================
   UNIRSE POR CÓDIGO
========================================================= */

function joinRoom(
    roomCode,
    plane = AIR_FLIGHT.plane
) {

    if (!roomCode) {

        return;

    }


    sendMessage({

        type:
            "joinRoom",

        room:
            String(roomCode)
                .trim()
                .toUpperCase(),

        plane:
            plane

    });

}


/* =========================================================
   BUSCAR PARTIDA AL AZAR
========================================================= */

function findMatch(
    plane = AIR_FLIGHT.plane
) {

    sendMessage({

        type:
            "findMatch",

        plane:
            plane

    });

}


/* =========================================================
   JOIN
========================================================= */

function joinMultiplayer(
    plane = AIR_FLIGHT.plane
) {

    sendMessage({

        type:
            "join",

        plane:
            plane

    });

}


/* =========================================================
   SALIR DE SALA
========================================================= */

function leaveRoom() {

    if (
        !AIR_FLIGHT.room
    ) {

        return;

    }


    sendMessage({

        type:
            "leaveRoom"

    });

}


/* =========================================================
   SALA CREADA
========================================================= */

function handleRoomCreated(data) {

    AIR_FLIGHT.room =
        data.room || null;

    AIR_FLIGHT.isHost =
        Boolean(data.host);

    AIR_FLIGHT.gameState =
        "waiting";


    log(
        "🏠 Sala creada:",
        AIR_FLIGHT.room
    );


    updateRoomUI();

}


/* =========================================================
   SALA UNIDA
========================================================= */

function handleRoomJoined(data) {

    AIR_FLIGHT.room =
        data.room || null;

    AIR_FLIGHT.isHost =
        Boolean(data.host);

    AIR_FLIGHT.gameState =
        data.gameState ||
        "waiting";


    log(
        "👥 Unido a sala:",
        AIR_FLIGHT.room
    );


    updateRoomUI();

}


/* =========================================================
   ERROR DE SALA
========================================================= */

function handleRoomError(data) {

    warn(
        "Error de sala:",
        data.message
    );


    showMessage(
        data.message ||
        "Error en la sala."
    );

}


/* =========================================================
   PARTIDA PÚBLICA CREADA
========================================================= */

function handlePublicMatchCreated(data) {

    AIR_FLIGHT.room =
        data.room || null;

    AIR_FLIGHT.gameState =
        "waiting";


    log(
        "🎮 Sala pública:",
        AIR_FLIGHT.room
    );


    updateRoomUI();

}


/* =========================================================
   JUGADORES DE LA SALA
========================================================= */

function handleRoomPlayers(data) {

    AIR_FLIGHT.room =
        data.room ||
        AIR_FLIGHT.room;

    AIR_FLIGHT.gameState =
        data.gameState ||
        AIR_FLIGHT.gameState;

    AIR_FLIGHT.timeRemaining =
        Number(
            data.timeRemaining || 0
        );


    AIR_FLIGHT.players.clear();


    if (
        Array.isArray(data.players)
    ) {

        for (
            const player
            of data.players
        ) {

            if (
                player &&
                player.id
            ) {

                AIR_FLIGHT.players.set(
                    player.id,
                    normalizePlayer(
                        player
                    )
                );

            }

        }

    }


    updatePlayers();

    updateHUD();

    updateRoomUI();

}


/* =========================================================
   NORMALIZAR JUGADOR
========================================================= */

function normalizePlayer(player) {

    return {

        id:
            player.id,

        x:
            Number(player.x || 0),

        y:
            Number(player.y || 0),

        z:
            Number(player.z || 0),

        rotationX:
            Number(player.rotationX || 0),

        rotationY:
            Number(player.rotationY || 0),

        rotationZ:
            Number(player.rotationZ || 0),

        plane:
            Number(player.plane || 0),

        maxHealth:
            Number(player.maxHealth || 100),

        health:
            Number(player.health || 0),

        alive:
            Boolean(player.alive),

        kills:
            Number(player.kills || 0),

        deaths:
            Number(player.deaths || 0),

        score:
            Number(player.score || 0),

        connected:
            player.connected !== false

    };

}


/* =========================================================
   HOST
========================================================= */

function handleRoomHost(data) {

    AIR_FLIGHT.isHost =
        data.room ===
        AIR_FLIGHT.room;


    updateRoomUI();

}


/* =========================================================
   JUGADOR ENTRÓ
========================================================= */

function handlePlayerJoined(data) {

    if (
        !data.id
    ) {

        return;

    }


    let player =
        AIR_FLIGHT.players.get(
            data.id
        );


    if (!player) {

        player = normalizePlayer({

            id:
                data.id,

            plane:
                data.plane || 0

        });

    }


    player.connected = true;


    if (
        data.plane !== undefined
    ) {

        player.plane =
            Number(data.plane);

    }


    AIR_FLIGHT.players.set(
        data.id,
        player
    );


    updatePlayers();

}


/* =========================================================
   JUGADOR SALIÓ
========================================================= */

function handlePlayerLeft(data) {

    if (!data.id) {
        return;
    }


    AIR_FLIGHT.players.delete(
        data.id
    );


    updatePlayers();

}


/* =========================================================
   JUGADOR DESCONECTADO
========================================================= */

function handlePlayerDisconnected(data) {

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );


    if (player) {

        player.connected = false;

        AIR_FLIGHT.players.set(
            data.id,
            player
        );

    }


    updatePlayers();

}


/* =========================================================
   JUGADOR RECONECTADO
========================================================= */

function handlePlayerReconnected(data) {

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );


    if (player) {

        player.connected = true;

        AIR_FLIGHT.players.set(
            data.id,
            player
        );

    }


    updatePlayers();

}


/* =========================================================
   ACTUALIZAR JUGADOR
========================================================= */

function handlePlayerUpdate(data) {

    if (!data.id) {
        return;
    }


    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        return;

    }


    const oldPlayer =
        AIR_FLIGHT.players.get(
            data.id
        ) || normalizePlayer({

            id:
                data.id

        });


    oldPlayer.x =
        Number(data.x || 0);

    oldPlayer.y =
        Number(data.y || 0);

    oldPlayer.z =
        Number(data.z || 0);

    oldPlayer.rotationX =
        Number(data.rotationX || 0);

    oldPlayer.rotationY =
        Number(data.rotationY || 0);

    oldPlayer.rotationZ =
        Number(data.rotationZ || 0);

    oldPlayer.plane =
        Number(data.plane || 0);

    oldPlayer.maxHealth =
        Number(data.maxHealth || 100);

    oldPlayer.health =
        Number(data.health || 0);

    oldPlayer.alive =
        Boolean(data.alive);

    oldPlayer.kills =
        Number(data.kills || 0);

    oldPlayer.deaths =
        Number(data.deaths || 0);

    oldPlayer.score =
        Number(data.score || 0);


    AIR_FLIGHT.players.set(
        data.id,
        oldPlayer
    );


    updateRemotePlayer(
        oldPlayer
    );


    updateHUD();

}


/* =========================================================
   PARTIDA INICIADA
========================================================= */

function handleGameStarted(data) {

    AIR_FLIGHT.gameState =
        "playing";

    AIR_FLIGHT.matchNumber =
        Number(
            data.matchNumber || 0
        );

    AIR_FLIGHT.timeRemaining =
        Number(
            data.timeRemaining ||
            data.duration ||
            0
        );


    log(
        "🚀 PARTIDA INICIADA"
    );


    updateHUD();

    updateGameState();

}


/* =========================================================
   PARTIDA ESPERANDO
========================================================= */

function handleGameWaiting(data) {

    AIR_FLIGHT.gameState =
        "waiting";


    AIR_FLIGHT.timeRemaining = 0;


    log(
        "⏳ Esperando jugadores:",
        data.reason || ""
    );


    updateHUD();

    updateGameState();

}


/* =========================================================
   TIEMPO
========================================================= */

function handleMatchTime(data) {

    AIR_FLIGHT.timeRemaining =
        Number(
            data.timeRemaining || 0
        );


    updateTimer();

}


/* =========================================================
   FINAL DE PARTIDA
========================================================= */

function handleGameEnded(data) {

    AIR_FLIGHT.gameState =
        "finished";

    AIR_FLIGHT.timeRemaining =
        0;


    log(
        "🏁 PARTIDA TERMINADA"
    );


    if (
        Array.isArray(data.ranking)
    ) {

        showRanking(
            data.ranking
        );

    }


    updateHUD();

    updateGameState();

}


/* =========================================================
   DAÑO
========================================================= */

function handlePlayerDamaged(data) {

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );


    if (data.id === AIR_FLIGHT.id) {

        AIR_FLIGHT.health =
            Number(data.health || 0);

        AIR_FLIGHT.maxHealth =
            Number(
                data.maxHealth ||
                AIR_FLIGHT.maxHealth
            );

        AIR_FLIGHT.alive =
            Boolean(data.alive);

    }


    if (player) {

        player.health =
            Number(data.health || 0);

        player.maxHealth =
            Number(
                data.maxHealth ||
                player.maxHealth
            );

        player.alive =
            Boolean(data.alive);

        AIR_FLIGHT.players.set(
            data.id,
            player
        );

    }


    updateHealth();

    updatePlayers();

}


/* =========================================================
   JUGADOR DESTRUIDO
========================================================= */

function handlePlayerDestroyed(data) {

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );


    if (data.id === AIR_FLIGHT.id) {

        AIR_FLIGHT.alive =
            false;

        AIR_FLIGHT.health =
            0;

    }


    if (player) {

        player.alive = false;

        player.health = 0;

        player.kills =
            Number(
                data.kills ||
                player.kills
            );

        player.deaths =
            Number(
                data.deaths ||
                player.deaths
            );

        player.score =
            Number(
                data.score ||
                player.score
            );

        AIR_FLIGHT.players.set(
            data.id,
            player
        );

    }


    updatePlayers();

    updateHealth();

}


/* =========================================================
   RESPAWN
========================================================= */

function handlePlayerRespawned(data) {

    const playerData = {

        id:
            data.id,

        x:
            data.x,

        y:
            data.y,

        z:
            data.z,

        rotationX:
            data.rotationX,

        rotationY:
            data.rotationY,

        rotationZ:
            data.rotationZ,

        maxHealth:
            data.maxHealth,

        health:
            data.health,

        alive:
            data.alive,

        kills:
            data.kills,

        deaths:
            data.deaths,

        score:
            data.score

    };


    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        AIR_FLIGHT.position.x =
            Number(data.x || 0);

        AIR_FLIGHT.position.y =
            Number(data.y || 0);

        AIR_FLIGHT.position.z =
            Number(data.z || 0);

        AIR_FLIGHT.rotation.x =
            Number(data.rotationX || 0);

        AIR_FLIGHT.rotation.y =
            Number(data.rotationY || 0);

        AIR_FLIGHT.rotation.z =
            Number(data.rotationZ || 0);

        updateLocalStats(
            data
        );

    }


    AIR_FLIGHT.players.set(
        data.id,
        normalizePlayer(
            playerData
        )
    );


    updatePlayers();

}


/* =========================================================
   SCORE UPDATE
========================================================= */

function handleScoreUpdate(data) {

    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        AIR_FLIGHT.score =
            Number(data.score || 0);

        AIR_FLIGHT.kills =
            Number(data.kills || 0);

        AIR_FLIGHT.deaths =
            Number(data.deaths || 0);

    }


    const player =
        AIR_FLIGHT.players.get(
            data.id
        );


    if (player) {

        player.score =
            Number(data.score || 0);

        player.kills =
            Number(data.kills || 0);

        player.deaths =
            Number(data.deaths || 0);

        AIR_FLIGHT.players.set(
            data.id,
            player
        );

    }


    updateHUD();

    updatePlayers();

}


/* =========================================================
   KILL CONFIRMADO
========================================================= */

function handleKillConfirmed(data) {

    log(
        "💥 Kill confirmado:",
        data
    );


    if (
        data.attackerId ===
        AIR_FLIGHT.id
    ) {

        if (
            data.attackerKills !==
            null &&
            data.attackerKills !==
            undefined
        ) {

            AIR_FLIGHT.kills =
                Number(
                    data.attackerKills
                );

        }


        if (
            data.attackerScore !==
            null &&
            data.attackerScore !==
            undefined
        ) {

            AIR_FLIGHT.score =
                Number(
                    data.attackerScore
                );

        }

    }


    if (
        data.victimId ===
        AIR_FLIGHT.id
    ) {

        if (
            data.victimDeaths !==
            undefined
        ) {

            AIR_FLIGHT.deaths =
                Number(
                    data.victimDeaths
                );

        }

    }


    updateHUD();

}


/* =========================================================
   CREAR MISIL
========================================================= */

function handleMissileCreated(data) {

    if (!data.id) {
        return;
    }


    const missile = {

        id:
            data.id,

        ownerId:
            data.ownerId,

        x:
            Number(data.x || 0),

        y:
            Number(data.y || 0),

        z:
            Number(data.z || 0),

        velocityX:
            Number(
                data.velocityX || 0
            ),

        velocityY:
            Number(
                data.velocityY || 0
            ),

        velocityZ:
            Number(
                data.velocityZ || 0
            )

    };


    AIR_FLIGHT.missiles.set(
        data.id,
        missile
    );


    createRemoteMissile(
        missile
    );


}


/* =========================================================
   ACTUALIZAR MISIL
========================================================= */

function handleMissileUpdate(data) {

    const missile =
        AIR_FLIGHT.missiles.get(
            data.id
        );


    if (!missile) {

        return;

    }


    missile.x =
        Number(data.x || 0);

    missile.y =
        Number(data.y || 0);

    missile.z =
        Number(data.z || 0);


    AIR_FLIGHT.missiles.set(
        data.id,
        missile
    );


    updateRemoteMissile(
        missile
    );

}


/* =========================================================
   IMPACTO DE MISIL
========================================================= */

function handleMissileHit(data) {

    log(
        "💥 Misil impactó:",
        data.targetId
    );


    /*
       El servidor es quien decide el daño.
       Acá solamente actualizamos la representación.
    */

    if (
        data.targetId ===
        AIR_FLIGHT.id
    ) {

        updateHealth();

    }


}


/* =========================================================
   MISIL ELIMINADO
========================================================= */

function handleMissileRemoved(data) {

    if (!data.id) {
        return;
    }


    AIR_FLIGHT.missiles.delete(
        data.id
    );


    removeRemoteMissile(
        data.id
    );

}


/* =========================================================
   SALIÓ DE SALA
========================================================= */

function handleLeftRoom(data) {

    AIR_FLIGHT.room =
        null;

    AIR_FLIGHT.isHost =
        false;

    AIR_FLIGHT.gameState =
        "waiting";

    AIR_FLIGHT.players.clear();

    AIR_FLIGHT.missiles.clear();


    updateRoomUI();

    updatePlayers();

}


/* =========================================================
   ERROR GENERAL
========================================================= */

function handleServerError(data) {

    error(
        "Servidor:",
        data.message
    );


    showMessage(
        data.message ||
        "Error del servidor."
    );

}


/* =========================================================
   ACTUALIZAR POSICIÓN LOCAL
========================================================= */

function updateLocalPosition(
    x,
    y,
    z,
    rotationX = AIR_FLIGHT.rotation.x,
    rotationY = AIR_FLIGHT.rotation.y,
    rotationZ = AIR_FLIGHT.rotation.z
) {

    AIR_FLIGHT.position.x =
        Number(x) || 0;

    AIR_FLIGHT.position.y =
        Number(y) || 0;

    AIR_FLIGHT.position.z =
        Number(z) || 0;

    AIR_FLIGHT.rotation.x =
        Number(rotationX) || 0;

    AIR_FLIGHT.rotation.y =
        Number(rotationY) || 0;

    AIR_FLIGHT.rotation.z =
        Number(rotationZ) || 0;


    sendPlayerUpdate();

}


/* =========================================================
   ACTUALIZAR AVIÓN LOCAL AL SERVIDOR
========================================================= */

function sendPlayerUpdate(
    force = false
) {

    const now =
        Date.now();


    if (
        !force &&
        now -
        AIR_FLIGHT.lastPositionSent <
        AIR_FLIGHT.positionSendInterval
    ) {

        return;

    }


    if (
        !AIR_FLIGHT.room ||
        !AIR_FLIGHT.alive
    ) {

        return;

    }


    AIR_FLIGHT.lastPositionSent =
        now;


    sendMessage({

        type:
            "playerUpdate",

        x:
            AIR_FLIGHT.position.x,

        y:
            AIR_FLIGHT.position.y,

        z:
            AIR_FLIGHT.position.z,

        rotationX:
            AIR_FLIGHT.rotation.x,

        rotationY:
            AIR_FLIGHT.rotation.y,

        rotationZ:
            AIR_FLIGHT.rotation.z,

        plane:
            AIR_FLIGHT.plane

    });

}


/* =========================================================
   CAMBIAR AVIÓN
========================================================= */

function setPlane(plane) {

    const value =
        Number(plane);


    if (
        !Number.isInteger(value) ||
        value < 0 ||
        value > 13
    ) {

        return;

    }


    AIR_FLIGHT.plane =
        value;


    if (
        AIR_FLIGHT.room
    ) {

        sendPlayerUpdate(
            true
        );

    }

}


/* =========================================================
   DISPARAR MISIL
========================================================= */

function fireMissile(
    x,
    y,
    z,
    velocityX,
    velocityY,
    velocityZ
) {

    if (
        !AIR_FLIGHT.room
    ) {

        return false;

    }


    if (
        !AIR_FLIGHT.alive
    ) {

        return false;

    }


    return sendMessage({

        type:
            "fireMissile",

        x:
            Number(x) || 0,

        y:
            Number(y) || 0,

        z:
            Number(z) || 0,

        velocityX:
            Number(velocityX) || 0,

        velocityY:
            Number(velocityY) || 0,

        velocityZ:
            Number(velocityZ) || 0

    });

}


/* =========================================================
   ELIMINAR MISIL PROPIO
========================================================= */

function removeMissile(
    missileId
) {

    if (!missileId) {
        return;
    }


    sendMessage({

        type:
            "removeMissile",

        id:
            missileId

    });

}


/* =========================================================
   DAÑO DIRECTO
========================================================= */

function damagePlayer(
    damage,
    attackerId = null,
    missileId = null
) {

    if (
        !AIR_FLIGHT.room ||
        !AIR_FLIGHT.alive
    ) {

        return;

    }


    const data = {

        type:
            "damagePlayer",

        damage:
            Number(damage) || 0

    };


    if (attackerId) {

        data.attackerId =
            String(attackerId);

    }


    if (missileId) {

        data.missileId =
            String(missileId);

    }


    sendMessage(data);

}


/* =========================================================
   INICIAR PARTIDA
========================================================= */

function startMatch() {

    if (
        !AIR_FLIGHT.room
    ) {

        return;

    }


    sendMessage({

        type:
            "startMatch"

    });

}


/* =========================================================
   SOLICITAR ESTADO
========================================================= */

function requestRoomState() {

    if (
        !AIR_FLIGHT.room
    ) {

        return;

    }


    /*
       El server actualiza el estado mediante
       roomPlayers después de acciones.
    */

    sendMessage({

        type:
            "join",

        plane:
            AIR_FLIGHT.plane

    });

}


/* =========================================================
   UI
========================================================= */

function updateHUD() {

    updateHealth();

    updateTimer();

    updateScore();

    updateKills();

    updateDeaths();

}


function updateHealth() {

    const elements = [

        document.getElementById(
            "health"
        ),

        document.getElementById(
            "playerHealth"
        ),

        document.getElementById(
            "healthValue"
        )

    ];


    for (
        const element
        of elements
    ) {

        if (element) {

            element.textContent =
                Math.max(
                    0,
                    AIR_FLIGHT.health
                );

        }

    }


    const bars = [

        document.getElementById(
            "healthBar"
        ),

        document.getElementById(
            "playerHealthBar"
        )

    ];


    for (
        const bar
        of bars
    ) {

        if (!bar) {
            continue;
        }


        const percentage =
            AIR_FLIGHT.maxHealth > 0
                ? (
                    AIR_FLIGHT.health /
                    AIR_FLIGHT.maxHealth
                ) * 100
                : 0;


        bar.style.width =
            Math.max(
                0,
                Math.min(
                    100,
                    percentage
                )
            ) + "%";

    }

}


function updateTimer() {

    const seconds =
        Math.ceil(
            Math.max(
                0,
                AIR_FLIGHT.timeRemaining
            ) / 1000
        );


    const minutes =
        Math.floor(
            seconds / 60
        );


    const remainingSeconds =
        seconds % 60;


    const text =
        String(minutes)
            .padStart(2, "0") +
        ":" +
        String(remainingSeconds)
            .padStart(2, "0");


    const elements = [

        document.getElementById(
            "timer"
        ),

        document.getElementById(
            "matchTimer"
        ),

        document.getElementById(
            "timeRemaining"
        )

    ];


    for (
        const element
        of elements
    ) {

        if (element) {

            element.textContent =
                text;

        }

    }

}


function updateScore() {

    const elements = [

        document.getElementById(
            "score"
        ),

        document.getElementById(
            "playerScore"
        )

    ];


    for (
        const element
        of elements
    ) {

        if (element) {

            element.textContent =
                AIR_FLIGHT.score;

        }

    }

}


function updateKills() {

    const elements = [

        document.getElementById(
            "kills"
        ),

        document.getElementById(
            "playerKills"
        )

    ];


    for (
        const element
        of elements
    ) {

        if (element) {

            element.textContent =
                AIR_FLIGHT.kills;

        }

    }

}


function updateDeaths() {

    const elements = [

        document.getElementById(
            "deaths"
        ),

        document.getElementById(
            "playerDeaths"
        )

    ];


    for (
        const element
        of elements
    ) {

        if (element) {

            element.textContent =
                AIR_FLIGHT.deaths;

        }

    }

}


/* =========================================================
   ACTUALIZAR UI DE SALA
========================================================= */

function updateRoomUI() {

    const roomElements = [

        document.getElementById(
            "roomCode"
        ),

        document.getElementById(
            "room"
        ),

        document.getElementById(
            "roomCodeDisplay"
        )

    ];


    for (
        const element
        of roomElements
    ) {

        if (element) {

            element.textContent =
                AIR_FLIGHT.room ||
                "Sin sala";

        }

    }


    const hostElements = [

        document.getElementById(
            "hostStatus"
        ),

        document.getElementById(
            "roomHost"
        )

    ];


    for (
        const element
        of hostElements
    ) {

        if (element) {

            element.textContent =
                AIR_FLIGHT.isHost
                    ? "HOST"
                    : "";

        }

    }

}


/* =========================================================
   ESTADO DE PARTIDA
========================================================= */

function updateGameState() {

    const elements = [

        document.getElementById(
            "gameState"
        ),

        document.getElementById(
            "matchState"
        )

    ];


    for (
        const element
        of elements
    ) {

        if (element) {

            element.textContent =
                AIR_FLIGHT.gameState;

        }

    }

}


/* =========================================================
   MOSTRAR MENSAJE
========================================================= */

function showMessage(message) {

    log(
        "💬",
        message
    );


    const element =
        document.getElementById(
            "serverMessage"
        );


    if (element) {

        element.textContent =
            message;

    }

}


/* =========================================================
   JUGADORES REMOTOS
========================================================= */

function updatePlayers() {

    for (
        const [
            id,
            player
        ]
        of AIR_FLIGHT.players
    ) {

        if (
            id === AIR_FLIGHT.id
        ) {

            continue;

        }


        updateRemotePlayer(
            player
        );

    }

}


/* =========================================================
   ACTUALIZAR AVIÓN REMOTO
========================================================= */

function updateRemotePlayer(player) {

    /*
       Esta función queda preparada para
       conectarse con el sistema visual
       de tu index.html.

       Si tu juego crea los aviones mediante
       otras funciones, podés usar:

       window.updateRemotePlane(player)

    */

    if (
        typeof window.updateRemotePlane ===
        "function"
    ) {

        window.updateRemotePlane(
            player
        );

    }

}


/* =========================================================
   CREAR MISIL REMOTO
========================================================= */

function createRemoteMissile(missile) {

    if (
        typeof window.createMissileFromServer ===
        "function"
    ) {

        window.createMissileFromServer(
            missile
        );

    }

}


/* =========================================================
   ACTUALIZAR MISIL REMOTO
========================================================= */

function updateRemoteMissile(missile) {

    if (
        typeof window.updateMissileFromServer ===
        "function"
    ) {

        window.updateMissileFromServer(
            missile
        );

    }

}


/* =========================================================
   ELIMINAR MISIL REMOTO
========================================================= */

function removeRemoteMissile(id) {

    if (
        typeof window.removeMissileFromServer ===
        "function"
    ) {

        window.removeMissileFromServer(
            id
        );

    }

}


/* =========================================================
   RANKING
========================================================= */

function showRanking(ranking) {

    log(
        "🏆 RANKING:"
    );


    console.table(
        ranking
    );


    const element =
        document.getElementById(
            "ranking"
        );


    if (!element) {
        return;
    }


    element.innerHTML = "";


    for (
        const player
        of ranking
    ) {

        const row =
            document.createElement(
                "div"
            );


        row.textContent =
            "#" +
            player.position +
            " — " +
            player.id +
            " | " +
            player.score +
            " pts | Kills: " +
            player.kills +
            " | Muertes: " +
            player.deaths;


        element.appendChild(
            row
        );

    }

}


/* =========================================================
   GUARDAR SESIÓN
========================================================= */

function saveSession() {

    try {

        if (
            AIR_FLIGHT.id
        ) {

            localStorage.setItem(
                "airFlightPlayerId",
                AIR_FLIGHT.id
            );

        }


        if (
            AIR_FLIGHT.reconnectToken
        ) {

            localStorage.setItem(
                "airFlightReconnectToken",
                AIR_FLIGHT.reconnectToken
            );

        }

    } catch (err) {

        warn(
            "No se pudo guardar sesión."
        );

    }

}


/* =========================================================
   CARGAR SESIÓN
========================================================= */

function loadSession() {

    try {

        const id =
            localStorage.getItem(
                "airFlightPlayerId"
            );

        const token =
            localStorage.getItem(
                "airFlightReconnectToken"
            );


        if (id) {

            AIR_FLIGHT.id =
                id;

        }


        if (token) {

            AIR_FLIGHT.reconnectToken =
                token;

        }

    } catch (err) {

        warn(
            "No se pudo cargar sesión."
        );

    }

}


/* =========================================================
   BORRAR SESIÓN
========================================================= */

function clearSession() {

    try {

        localStorage.removeItem(
            "airFlightPlayerId"
        );

        localStorage.removeItem(
            "airFlightReconnectToken"
        );

    } catch (err) {

        warn(
            "No se pudo borrar sesión."
        );

    }

}


/* =========================================================
   CERRAR CONEXIÓN
========================================================= */

function disconnectFromServer() {

    AIR_FLIGHT.intentionalClose =
        true;


    if (
        AIR_FLIGHT.reconnectTimer
    ) {

        clearTimeout(
            AIR_FLIGHT.reconnectTimer
        );

        AIR_FLIGHT.reconnectTimer =
            null;

    }


    if (
        AIR_FLIGHT.socket
    ) {

        AIR_FLIGHT.socket.close();

    }


    AIR_FLIGHT.connected =
        false;

}


/* =========================================================
   EXPONER FUNCIONES PARA INDEX.HTML
========================================================= */

window.AIR_FLIGHT =
    AIR_FLIGHT;


window.connectToServer =
    connectToServer;


window.createRoom =
    createRoom;


window.joinRoom =
    joinRoom;


window.findMatch =
    findMatch;


window.joinMultiplayer =
    joinMultiplayer;


window.leaveRoom =
    leaveRoom;


window.startMatch =
    startMatch;


window.setPlane =
    setPlane;


window.fireMissile =
    fireMissile;


window.removeMissile =
    removeMissile;


window.damagePlayer =
    damagePlayer;


window.updateLocalPosition =
    updateLocalPosition;


window.sendPlayerUpdate =
    sendPlayerUpdate;


window.disconnectFromServer =
    disconnectFromServer;


/* =========================================================
   INICIAR
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadSession();

        connectToServer();

        updateHUD();

        updateRoomUI();

        updateGameState();

    }
);


/* =========================================================
   PROTECCIÓN AL CERRAR PÁGINA
========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        /*
           No borramos la sesión.
           El server permite reconectarse
           durante RECONNECT_GRACE_TIME.
        */

    }
);


/* =========================================================
   EXPORTACIÓN FINAL
========================================================= */

log(
    "✈️ AIR FLIGHT script.js cargado correctamente"
);

log(
    "📡 Sistema WebSocket preparado"
);

log(
    "👥 Sistema de jugadores preparado"
);

log(
    "🏠 Sistema de salas preparado"
);

log(
    "🚀 Sistema de misiles preparado"
);

log(
    "❤️ Sistema de vida preparado"
);

log(
    "💥 Sistema de daño preparado"
);

log(
    "🏆 Sistema de puntuación preparado"
);

log(
    "☠️ Sistema de kills/muertes preparado"
);

log(
    "🔄 Sistema de respawn preparado"
);

log(
    "⏱️ Sistema de temporizador preparado"
);

log(
    "🏁 Sistema de final de partida preparado"
);

log(
    "🔌 Conexión con server.js preparada"
);