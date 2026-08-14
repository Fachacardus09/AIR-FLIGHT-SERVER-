/* =====================================================
   AIR FLIGHT
   SCRIPT.JS
   CONEXIÓN COMPLETA CON SERVER.JS
===================================================== */

"use strict";

/* =====================================================
   CONFIGURACIÓN
===================================================== */

const AIR_FLIGHT = {

    socket: null,

    connected: false,

    reconnecting: false,

    playerId: null,

    reconnectToken: null,

    roomCode: null,

    isHost: false,

    gameState: "waiting",

    players: new Map(),

    missiles: new Map(),

    maxHealth: 100,

    health: 100,

    alive: true,

    kills: 0,

    deaths: 0,

    score: 0,

    plane: 0,

    matchNumber: 0,

    matchDuration: 5 * 60 * 1000,

    timeRemaining: 0,

    reconnectAttempts: 0,

    maxReconnectAttempts: 10,

    reconnectDelay: 2000,

    lastPlayerUpdate: 0,

    playerUpdateInterval: 50,

    initialized: false

};


/* =====================================================
   REFERENCIA CORTA
===================================================== */

const AF = AIR_FLIGHT;


/* =====================================================
   OBTENER ELEMENTOS DEL HTML
===================================================== */

function getElement(...ids) {

    for (const id of ids) {

        const element =
            document.getElementById(id);

        if (element) {
            return element;
        }
    }

    return null;
}


/* =====================================================
   MOSTRAR MENSAJES
===================================================== */

function showMessage(message) {

    console.log("✈️ AIR FLIGHT:", message);

    const element =
        getElement(
            "serverMessage",
            "connectionMessage",
            "multiplayerMessage",
            "message"
        );

    if (element) {
        element.textContent =
            String(message);
    }
}


/* =====================================================
   ESTADO DE CONEXIÓN
===================================================== */

function updateConnectionUI() {

    const elements = [

        getElement(
            "connectionStatus",
            "serverStatus"
        ),

        getElement(
            "onlineStatus"
        )

    ].filter(Boolean);

    for (const element of elements) {

        if (AF.connected) {

            element.textContent =
                "🟢 CONECTADO";

        } else {

            element.textContent =
                "🔴 DESCONECTADO";
        }
    }
}


/* =====================================================
   CREAR URL DEL WEBSOCKET
===================================================== */

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


/* =====================================================
   CONECTAR
===================================================== */

function connectToServer() {

    if (
        AF.socket &&
        (
            AF.socket.readyState ===
                WebSocket.OPEN ||

            AF.socket.readyState ===
                WebSocket.CONNECTING
        )
    ) {

        return;
    }

    try {

        AF.socket =
            new WebSocket(
                getWebSocketURL()
            );

    } catch (error) {

        console.error(
            "❌ No se pudo crear WebSocket:",
            error
        );

        AF.connected =
            false;

        updateConnectionUI();

        scheduleReconnect();

        return;
    }


    AF.socket.addEventListener(
        "open",
        handleSocketOpen
    );


    AF.socket.addEventListener(
        "message",
        handleSocketMessage
    );


    AF.socket.addEventListener(
        "close",
        handleSocketClose
    );


    AF.socket.addEventListener(
        "error",
        handleSocketError
    );
}


/* =====================================================
   SOCKET ABIERTO
===================================================== */

function handleSocketOpen() {

    console.log(
        "✈️ AIR FLIGHT conectado al servidor"
    );

    AF.connected =
        true;

    AF.reconnecting =
        false;

    AF.reconnectAttempts =
        0;

    updateConnectionUI();

    showMessage(
        "🟢 Conectado al servidor"
    );


    /*
       Si ya teníamos una sesión,
       intentamos recuperarla.
    */

    if (
        AF.playerId &&
        AF.reconnectToken
    ) {

        sendMessage({

            type:
                "reconnect",

            id:
                AF.playerId,

            reconnectToken:
                AF.reconnectToken

        });

    }
}


/* =====================================================
   RECIBIR MENSAJES
===================================================== */

function handleSocketMessage(event) {

    let data;

    try {

        data =
            JSON.parse(
                event.data
            );

    } catch (error) {

        console.error(
            "❌ Mensaje inválido:",
            event.data
        );

        return;
    }

    if (
        !data ||
        typeof data !== "object"
    ) {
        return;
    }

    console.log(
        "📡 Servidor:",
        data
    );


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

        case "roomPlayers":
            handleRoomPlayers(data);
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

        case "roomHost":
            handleRoomHost(data);
            break;

        case "leftRoom":
            handleLeftRoom(data);
            break;

        case "publicMatchCreated":
            handlePublicMatchCreated(data);
            break;

        case "roomError":
            handleRoomError(data);
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

        case "playerUpdate":
            handlePlayerUpdate(data);
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

        case "error":
            handleServerError(data);
            break;

        default:

            console.warn(
                "⚠️ Mensaje desconocido:",
                data.type
            );

            break;
    }
}


/* =====================================================
   WELCOME
===================================================== */

function handleWelcome(data) {

    AF.playerId =
        data.id ||
        null;

    AF.reconnectToken =
        data.reconnectToken ||
        null;

    AF.maxHealth =
        Number(
            data.maxHealth
        ) || 100;

    AF.health =
        Number(
            data.health
        );

    AF.alive =
        data.alive !== false;

    AF.kills =
        Number(
            data.kills
        ) || 0;

    AF.deaths =
        Number(
            data.deaths
        ) || 0;

    AF.score =
        Number(
            data.score
        ) || 0;

    saveSession();

    updateHealthUI();

    updateStatsUI();

    console.log(
        "👤 Jugador creado:",
        AF.playerId
    );
}


/* =====================================================
   RECONEXIÓN CORRECTA
===================================================== */

function handleReconnected(data) {

    AF.playerId =
        data.id ||
        AF.playerId;

    AF.roomCode =
        data.room ||
        null;

    AF.reconnectToken =
        data.reconnectToken ||
        AF.reconnectToken;

    AF.maxHealth =
        Number(
            data.maxHealth
        ) || AF.maxHealth;

    AF.health =
        Number(
            data.health
        );

    AF.alive =
        data.alive !== false;

    AF.kills =
        Number(
            data.kills
        ) || 0;

    AF.deaths =
        Number(
            data.deaths
        ) || 0;

    AF.score =
        Number(
            data.score
        ) || 0;

    saveSession();

    updateHealthUI();

    updateStatsUI();

    showMessage(
        "🔄 Reconectado correctamente"
    );

    if (AF.roomCode) {

        showRoomCode(
            AF.roomCode
        );
    }
}


/* =====================================================
   ERROR DE RECONEXIÓN
===================================================== */

function handleReconnectError(data) {

    console.warn(
        "⚠️ Reconexión fallida:",
        data.message
    );

    /*
       Limpiamos la sesión solamente
       si el servidor rechazó el token.
    */

    clearSession();

    AF.playerId =
        null;

    AF.reconnectToken =
        null;

    AF.roomCode =
        null;

    AF.reconnecting =
        false;

    showMessage(
        data.message ||
        "No se pudo reconectar"
    );
}


/* =====================================================
   CREAR SALA
===================================================== */

function createRoom(plane = AF.plane) {

    sendMessage({

        type:
            "createRoom",

        plane:
            Number(plane) || 0

    });
}


/* =====================================================
   UNIRSE POR CÓDIGO
===================================================== */

function joinRoom(roomCode, plane = AF.plane) {

    if (!roomCode) {

        showMessage(
            "Ingresá un código de sala"
        );

        return;
    }

    sendMessage({

        type:
            "joinRoom",

        room:
            String(
                roomCode
            )
            .trim()
            .toUpperCase(),

        plane:
            Number(plane) || 0

    });
}


/* =====================================================
   PARTIDA AL AZAR
===================================================== */

function findMatch(plane = AF.plane) {

    sendMessage({

        type:
            "findMatch",

        plane:
            Number(plane) || 0

    });
}


/* =====================================================
   JOIN GENERAL
===================================================== */

function joinMultiplayer(plane = AF.plane) {

    sendMessage({

        type:
            "join",

        plane:
            Number(plane) || 0

    });
}


/* =====================================================
   SALIR DE SALA
===================================================== */

function leaveRoom() {

    sendMessage({

        type:
            "leaveRoom"

    });
}


/* =====================================================
   SALA CREADA
===================================================== */

function handleRoomCreated(data) {

    AF.roomCode =
        data.room ||
        null;

    AF.isHost =
        data.host === true;

    AF.gameState =
        "waiting";

    showRoomCode(
        AF.roomCode
    );

    saveSession();

    showMessage(
        "🏠 Sala creada"
    );
}


/* =====================================================
   SALA UNIDA
===================================================== */

function handleRoomJoined(data) {

    AF.roomCode =
        data.room ||
        null;

    AF.isHost =
        data.host === true;

    AF.gameState =
        data.gameState ||
        "waiting";

    showRoomCode(
        AF.roomCode
    );

    saveSession();

    showMessage(
        "👥 Te uniste a la sala"
    );
}


/* =====================================================
   MOSTRAR CÓDIGO
===================================================== */

function showRoomCode(code) {

    if (!code) {
        return;
    }

    const elements = [

        getElement(
            "roomCode",
            "room-code",
            "multiplayerRoomCode"
        )

    ].filter(Boolean);

    for (const element of elements) {

        element.textContent =
            code;

        if (
            "value" in element
        ) {
            element.value =
                code;
        }
    }
}


/* =====================================================
   ESTADO COMPLETO DE JUGADORES
===================================================== */

function handleRoomPlayers(data) {

    AF.roomCode =
        data.room ||
        AF.roomCode;

    AF.gameState =
        data.gameState ||
        AF.gameState;

    AF.timeRemaining =
        Number(
            data.timeRemaining
        ) || 0;


    AF.players.clear();


    if (
        Array.isArray(
            data.players
        )
    ) {

        for (
            const player
            of data.players
        ) {

            if (
                !player ||
                !player.id
            ) {
                continue;
            }

            AF.players.set(
                player.id,
                normalizePlayer(
                    player
                )
            );
        }
    }

    renderPlayers();

    updateMatchUI();
}


/* =====================================================
   NORMALIZAR JUGADOR
===================================================== */

function normalizePlayer(player) {

    return {

        id:
            player.id,

        x:
            Number(
                player.x
            ) || 0,

        y:
            Number(
                player.y
            ) || 0,

        z:
            Number(
                player.z
            ) || 0,

        rotationX:
            Number(
                player.rotationX
            ) || 0,

        rotationY:
            Number(
                player.rotationY
            ) || 0,

        rotationZ:
            Number(
                player.rotationZ
            ) || 0,

        plane:
            Number(
                player.plane
            ) || 0,

        maxHealth:
            Number(
                player.maxHealth
            ) || 100,

        health:
            Number(
                player.health
            ),

        alive:
            player.alive !== false,

        kills:
            Number(
                player.kills
            ) || 0,

        deaths:
            Number(
                player.deaths
            ) || 0,

        score:
            Number(
                player.score
            ) || 0,

        connected:
            player.connected !== false

    };
}


/* =====================================================
   JUGADOR ENTRA
===================================================== */

function handlePlayerJoined(data) {

    if (!data.id) {
        return;
    }

    const existing =
        AF.players.get(
            data.id
        ) || {

            id:
                data.id,

            x: 0,
            y: 0,
            z: 0,

            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,

            plane:
                Number(
                    data.plane
                ) || 0,

            maxHealth: 100,
            health: 100,

            alive: true,

            kills: 0,
            deaths: 0,
            score: 0,

            connected: true
        };


    existing.plane =
        Number(
            data.plane
        ) || existing.plane;


    AF.players.set(
        data.id,
        existing
    );


    renderPlayers();

    showMessage(
        "👤 Un jugador se unió"
    );
}


/* =====================================================
   JUGADOR SALE
===================================================== */

function handlePlayerLeft(data) {

    if (!data.id) {
        return;
    }

    removeRemotePlayer(
        data.id
    );

    showMessage(
        "👋 Un jugador salió"
    );
}


/* =====================================================
   JUGADOR DESCONECTADO
===================================================== */

function handlePlayerDisconnected(data) {

    const player =
        AF.players.get(
            data.id
        );

    if (player) {

        player.connected =
            false;
    }

    renderPlayers();
}


/* =====================================================
   JUGADOR RECONECTADO
===================================================== */

function handlePlayerReconnected(data) {

    const player =
        AF.players.get(
            data.id
        );

    if (player) {

        player.connected =
            true;
    }

    renderPlayers();
}


/* =====================================================
   CAMBIO DE HOST
===================================================== */

function handleRoomHost(data) {

    AF.isHost =
        true;

    showMessage(
        "👑 Ahora sos el creador de la sala"
    );
}


/* =====================================================
   SALIÓ DE SALA
===================================================== */

function handleLeftRoom() {

    AF.roomCode =
        null;

    AF.isHost =
        false;

    AF.gameState =
        "waiting";

    AF.players.clear();

    AF.missiles.clear();

    showMessage(
        "Saliste de la sala"
    );

    updateMatchUI();

    clearSessionRoom();
}


/* =====================================================
   PARTIDA PÚBLICA
===================================================== */

function handlePublicMatchCreated(data) {

    if (data.room) {

        AF.roomCode =
            data.room;

        showRoomCode(
            data.room
        );

        saveSession();
    }
}


/* =====================================================
   ERROR DE SALA
===================================================== */

function handleRoomError(data) {

    showMessage(
        "⚠️ " +
        (
            data.message ||
            "Error de sala"
        )
    );

    console.warn(
        "Room error:",
        data.message
    );
}


/* =====================================================
   PARTIDA INICIADA
===================================================== */

function handleGameStarted(data) {

    AF.gameState =
        "playing";

    AF.matchNumber =
        Number(
            data.matchNumber
        ) || 0;

    AF.matchDuration =
        Number(
            data.duration
        ) ||
        5 * 60 * 1000;

    AF.timeRemaining =
        Number(
            data.timeRemaining
        ) ||
        AF.matchDuration;


    AF.health =
        AF.maxHealth;

    AF.alive =
        true;

    AF.kills =
        0;

    AF.deaths =
        0;

    AF.score =
        0;


    AF.missiles.clear();

    updateHealthUI();

    updateStatsUI();

    updateMatchUI();

    showMessage(
        "🚀 ¡Partida iniciada!"
    );


    /*
       Avisamos al código principal
       del juego.
    */

    dispatchGameEvent(
        "airflight:gameStarted",
        data
    );
}


/* =====================================================
   PARTIDA EN ESPERA
===================================================== */

function handleGameWaiting(data) {

    AF.gameState =
        "waiting";

    AF.timeRemaining =
        0;

    updateMatchUI();

    showMessage(
        data.reason ||
        "Esperando jugadores..."
    );
}


/* =====================================================
   TIEMPO DE PARTIDA
===================================================== */

function handleMatchTime(data) {

    AF.timeRemaining =
        Math.max(
            0,
            Number(
                data.timeRemaining
            ) || 0
        );

    updateMatchUI();
}


/* =====================================================
   FINAL DE PARTIDA
===================================================== */

function handleGameEnded(data) {

    AF.gameState =
        "finished";

    AF.timeRemaining =
        0;

    AF.missiles.clear();

    updateMatchUI();

    renderRanking(
        data.ranking || []
    );

    showMessage(
        "🏁 ¡Partida terminada!"
    );

    dispatchGameEvent(
        "airflight:gameEnded",
        data
    );
}


/* =====================================================
   INICIAR PARTIDA
===================================================== */

function startMatch() {

    sendMessage({

        type:
            "startMatch"

    });
}


/* =====================================================
   ACTUALIZAR JUGADOR LOCAL
===================================================== */

function sendPlayerUpdate(
    state
) {

    if (!AF.connected) {
        return;
    }

    if (!AF.playerId) {
        return;
    }

    const now =
        Date.now();

    if (
        now -
        AF.lastPlayerUpdate <
        AF.playerUpdateInterval
    ) {
        return;
    }

    AF.lastPlayerUpdate =
        now;


    const data = {

        type:
            "playerUpdate",

        x:
            Number(
                state.x
            ) || 0,

        y:
            Number(
                state.y
            ) || 0,

        z:
            Number(
                state.z
            ) || 0,

        rotationX:
            Number(
                state.rotationX
            ) || 0,

        rotationY:
            Number(
                state.rotationY
            ) || 0,

        rotationZ:
            Number(
                state.rotationZ
            ) || 0,

        plane:
            Number(
                state.plane
            ) || AF.plane

    };


    sendMessage(
        data
    );
}


/* =====================================================
   RECIBIR MOVIMIENTO DE OTRO JUGADOR
===================================================== */

function handlePlayerUpdate(data) {

    if (!data.id) {
        return;
    }

    if (
        data.id ===
        AF.playerId
    ) {
        return;
    }


    const player =
        AF.players.get(
            data.id
        ) || {

            id:
                data.id,

            x: 0,
            y: 0,
            z: 0,

            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,

            plane: 0,

            maxHealth: 100,
            health: 100,

            alive: true,

            kills: 0,
            deaths: 0,
            score: 0,

            connected: true
        };


    player.x =
        Number(
            data.x
        ) || 0;

    player.y =
        Number(
            data.y
        ) || 0;

    player.z =
        Number(
            data.z
        ) || 0;

    player.rotationX =
        Number(
            data.rotationX
        ) || 0;

    player.rotationY =
        Number(
            data.rotationY
        ) || 0;

    player.rotationZ =
        Number(
            data.rotationZ
        ) || 0;

    player.plane =
        Number(
            data.plane
        ) || 0;

    player.maxHealth =
        Number(
            data.maxHealth
        ) || 100;

    player.health =
        Number(
            data.health
        );

    player.alive =
        data.alive !== false;

    player.kills =
        Number(
            data.kills
        ) || 0;

    player.deaths =
        Number(
            data.deaths
        ) || 0;

    player.score =
        Number(
            data.score
        ) || 0;


    AF.players.set(
        data.id,
        player
    );


    dispatchGameEvent(
        "airflight:playerUpdate",
        player
    );
}


/* =====================================================
   DISPARAR MISIL
===================================================== */

function fireMissile(data) {

    if (!AF.connected) {
        return;
    }

    if (!AF.alive) {
        return;
    }

    sendMessage({

        type:
            "fireMissile",

        x:
            Number(
                data.x
            ) || 0,

        y:
            Number(
                data.y
            ) || 0,

        z:
            Number(
                data.z
            ) || 0,

        velocityX:
            Number(
                data.velocityX
            ) || 0,

        velocityY:
            Number(
                data.velocityY
            ) || 0,

        velocityZ:
            Number(
                data.velocityZ
            ) || 0

    });
}


/* =====================================================
   MISIL CREADO
===================================================== */

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
            Number(
                data.x
            ) || 0,

        y:
            Number(
                data.y
            ) || 0,

        z:
            Number(
                data.z
            ) || 0,

        velocityX:
            Number(
                data.velocityX
            ) || 0,

        velocityY:
            Number(
                data.velocityY
            ) || 0,

        velocityZ:
            Number(
                data.velocityZ
            ) || 0

    };


    AF.missiles.set(
        data.id,
        missile
    );


    dispatchGameEvent(
        "airflight:missileCreated",
        missile
    );
}


/* =====================================================
   ACTUALIZAR MISIL
===================================================== */

function handleMissileUpdate(data) {

    const missile =
        AF.missiles.get(
            data.id
        );

    if (!missile) {
        return;
    }


    missile.x =
        Number(
            data.x
        ) || 0;

    missile.y =
        Number(
            data.y
        ) || 0;

    missile.z =
        Number(
            data.z
        ) || 0;


    dispatchGameEvent(
        "airflight:missileUpdate",
        missile
    );
}


/* =====================================================
   IMPACTO DE MISIL
===================================================== */

function handleMissileHit(data) {

    dispatchGameEvent(
        "airflight:missileHit",
        data
    );
}


/* =====================================================
   ELIMINAR MISIL
===================================================== */

function handleMissileRemoved(data) {

    if (!data.id) {
        return;
    }

    AF.missiles.delete(
        data.id
    );


    dispatchGameEvent(
        "airflight:missileRemoved",
        data
    );
}


/* =====================================================
   DAÑO AL JUGADOR
===================================================== */

function handlePlayerDamaged(data) {

    const player =
        AF.players.get(
            data.id
        );

    if (
        data.id ===
        AF.playerId
    ) {

        AF.health =
            Number(
                data.health
            );

        AF.maxHealth =
            Number(
                data.maxHealth
            ) || AF.maxHealth;

        AF.alive =
            data.alive !== false;

        updateHealthUI();

    } else if (player) {

        player.health =
            Number(
                data.health
            );

        player.maxHealth =
            Number(
                data.maxHealth
            ) || player.maxHealth;

        player.alive =
            data.alive !== false;

        renderPlayers();
    }


    dispatchGameEvent(
        "airflight:playerDamaged",
        data
    );
}


/* =====================================================
   JUGADOR DESTRUIDO
===================================================== */

function handlePlayerDestroyed(data) {

    if (
        data.id ===
        AF.playerId
    ) {

        AF.health =
            0;

        AF.alive =
            false;

        AF.deaths =
            Number(
                data.deaths
            ) || AF.deaths;

        AF.score =
            Number(
                data.score
            ) || AF.score;

        updateHealthUI();

        updateStatsUI();

        showMessage(
            "💥 Avión destruido"
        );

    } else {

        const player =
            AF.players.get(
                data.id
            );

        if (player) {

            player.health =
                0;

            player.alive =
                false;
        }

        renderPlayers();
    }


    dispatchGameEvent(
        "airflight:playerDestroyed",
        data
    );
}


/* =====================================================
   RESPAWN
===================================================== */

function handlePlayerRespawned(data) {

    if (
        data.id ===
        AF.playerId
    ) {

        AF.health =
            Number(
                data.health
            );

        AF.maxHealth =
            Number(
                data.maxHealth
            ) || AF.maxHealth;

        AF.alive =
            true;

        updateHealthUI();

        showMessage(
            "🔄 Avión reaparecido"
        );

    } else {

        const player =
            AF.players.get(
                data.id
            );

        if (player) {

            Object.assign(
                player,
                normalizePlayer(
                    data
                )
            );
        }

        renderPlayers();
    }


    dispatchGameEvent(
        "airflight:playerRespawned",
        data
    );
}


/* =====================================================
   SCORE UPDATE
===================================================== */

function handleScoreUpdate(data) {

    if (
        data.id ===
        AF.playerId
    ) {

        AF.score =
            Number(
                data.score
            ) || 0;

        AF.kills =
            Number(
                data.kills
            ) || 0;

        AF.deaths =
            Number(
                data.deaths
            ) || 0;

        updateStatsUI();

        return;
    }


    const player =
        AF.players.get(
            data.id
        );

    if (player) {

        player.score =
            Number(
                data.score
            ) || 0;

        player.kills =
            Number(
                data.kills
            ) || 0;

        player.deaths =
            Number(
                data.deaths
            ) || 0;
    }


    renderPlayers();
}


/* =====================================================
   KILL CONFIRMADO
===================================================== */

function handleKillConfirmed(data) {

    if (
        data.attackerId ===
        AF.playerId
    ) {

        showMessage(
            "💥 ¡KILL! +100"
        );
    }

    if (
        data.victimId ===
        AF.playerId
    ) {

        showMessage(
            "☠️ Fuiste derribado"
        );
    }


    dispatchGameEvent(
        "airflight:killConfirmed",
        data
    );
}


/* =====================================================
   ERROR DEL SERVIDOR
===================================================== */

function handleServerError(data) {

    console.error(
        "❌ Servidor:",
        data.message
    );

    showMessage(
        "⚠️ " +
        (
            data.message ||
            "Error del servidor"
        )
    );
}


/* =====================================================
   ENVIAR MENSAJE
===================================================== */

function sendMessage(data) {

    if (
        !AF.socket ||
        AF.socket.readyState !==
            WebSocket.OPEN
    ) {

        console.warn(
            "⚠️ WebSocket no conectado"
        );

        return false;
    }

    try {

        AF.socket.send(
            JSON.stringify(
                data
            )
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Error enviando mensaje:",
            error
        );

        return false;
    }
}


/* =====================================================
   ACTUALIZAR VIDA
===================================================== */

function updateHealthUI() {

    const healthElements = [

        getElement(
            "health",
            "healthValue",
            "playerHealth"
        )

    ].filter(Boolean);


    for (
        const element
        of healthElements
    ) {

        element.textContent =
            Math.max(
                0,
                Math.round(
                    AF.health
                )
            );
    }


    const bars = [

        getElement(
            "healthBar",
            "playerHealthBar"
        )

    ].filter(Boolean);


    for (
        const bar
        of bars
    ) {

        const percentage =
            AF.maxHealth > 0
                ? (
                    AF.health /
                    AF.maxHealth
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


/* =====================================================
   ESTADÍSTICAS
===================================================== */

function updateStatsUI() {

    const scoreElements = [

        getElement(
            "score",
            "scoreValue",
            "playerScore"
        )

    ].filter(Boolean);


    for (
        const element
        of scoreElements
    ) {

        element.textContent =
            AF.score;
    }


    const killElements = [

        getElement(
            "kills",
            "killsValue",
            "playerKills"
        )

    ].filter(Boolean);


    for (
        const element
        of killElements
    ) {

        element.textContent =
            AF.kills;
    }


    const deathElements = [

        getElement(
            "deaths",
            "deathsValue",
            "playerDeaths"
        )

    ].filter(Boolean);


    for (
        const element
        of deathElements
    ) {

        element.textContent =
            AF.deaths;
    }
}


/* =====================================================
   TIEMPO
===================================================== */

function formatTime(milliseconds) {

    const totalSeconds =
        Math.ceil(
            Math.max(
                0,
                milliseconds
            ) / 1000
        );

    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const seconds =
        totalSeconds % 60;

    return (
        String(minutes)
            .padStart(2, "0") +
        ":" +
        String(seconds)
            .padStart(2, "0")
    );
}


/* =====================================================
   ACTUALIZAR UI DE PARTIDA
===================================================== */

function updateMatchUI() {

    const time =
        formatTime(
            AF.timeRemaining
        );


    const timeElements = [

        getElement(
            "matchTime",
            "timer",
            "timeRemaining"
        )

    ].filter(Boolean);


    for (
        const element
        of timeElements
    ) {

        element.textContent =
            time;
    }


    const stateElements = [

        getElement(
            "gameState",
            "matchState"
        )

    ].filter(Boolean);


    for (
        const element
        of stateElements
    ) {

        if (
            AF.gameState ===
            "playing"
        ) {

            element.textContent =
                "EN PARTIDA";

        } else if (
            AF.gameState ===
            "finished"
        ) {

            element.textContent =
                "FINALIZADA";

        } else {

            element.textContent =
                "ESPERANDO";
        }
    }
}


/* =====================================================
   RANKING
===================================================== */

function renderRanking(ranking) {

    const container =
        getElement(
            "ranking",
            "rankingList",
            "finalRanking"
        );

    if (!container) {
        return;
    }


    container.innerHTML = "";


    for (
        const player
        of ranking
    ) {

        const row =
            document.createElement(
                "div"
            );


        row.className =
            "ranking-row";


        row.textContent =
            "#" +
            player.position +
            " | " +
            player.score +
            " puntos | " +
            player.kills +
            " kills | " +
            player.deaths +
            " muertes";


        container.appendChild(
            row
        );
    }
}


/* =====================================================
   JUGADORES REMOTOS
===================================================== */

function renderPlayers() {

    /*
       Esta función mantiene el estado
       de los jugadores.

       El código 3D puede usar:

       AIR_FLIGHT.players

       para crear/mover los aviones.
    */

    dispatchGameEvent(
        "airflight:playersUpdated",
        Array.from(
            AF.players.values()
        )
    );
}


/* =====================================================
   ELIMINAR JUGADOR REMOTO
===================================================== */

function removeRemotePlayer(id) {

    AF.players.delete(
        id
    );


    dispatchGameEvent(
        "airflight:playerRemoved",
        {
            id:
                id
        }
    );


    renderPlayers();
}


/* =====================================================
   EVENTOS PARA EL CÓDIGO DEL JUEGO
===================================================== */

function dispatchGameEvent(
    name,
    detail
) {

    try {

        window.dispatchEvent(
            new CustomEvent(
                name,
                {
                    detail:
                        detail
                }
            )
        );

    } catch {
        /* Navegadores antiguos */
    }
}


/* =====================================================
   GUARDAR SESIÓN
===================================================== */

function saveSession() {

    try {

        localStorage.setItem(
            "airFlightPlayerId",
            AF.playerId || ""
        );

        localStorage.setItem(
            "airFlightReconnectToken",
            AF.reconnectToken || ""
        );

        localStorage.setItem(
            "airFlightRoom",
            AF.roomCode || ""
        );

    } catch (error) {

        console.warn(
            "No se pudo guardar sesión:",
            error
        );
    }
}


/* =====================================================
   CARGAR SESIÓN
===================================================== */

function loadSession() {

    try {

        AF.playerId =
            localStorage.getItem(
                "airFlightPlayerId"
            ) || null;

        AF.reconnectToken =
            localStorage.getItem(
                "airFlightReconnectToken"
            ) || null;

        AF.roomCode =
            localStorage.getItem(
                "airFlightRoom"
            ) || null;

    } catch (error) {

        console.warn(
            "No se pudo cargar sesión:",
            error
        );
    }
}


/* =====================================================
   LIMPIAR SESIÓN
===================================================== */

function clearSession() {

    try {

        localStorage.removeItem(
            "airFlightPlayerId"
        );

        localStorage.removeItem(
            "airFlightReconnectToken"
        );

        localStorage.removeItem(
            "airFlightRoom"
        );

    } catch {}
}


/* =====================================================
   LIMPIAR SOLO SALA
===================================================== */

function clearSessionRoom() {

    try {

        localStorage.removeItem(
            "airFlightRoom"
        );

    } catch {}
}


/* =====================================================
   SOCKET CERRADO
===================================================== */

function handleSocketClose() {

    AF.connected =
        false;

    updateConnectionUI();

    showMessage(
        "🔴 Servidor desconectado"
    );

    scheduleReconnect();
}


/* =====================================================
   SOCKET ERROR
===================================================== */

function handleSocketError(error) {

    console.error(
        "❌ WebSocket:",
        error
    );

    AF.connected =
        false;

    updateConnectionUI();
}


/* =====================================================
   RECONEXIÓN AUTOMÁTICA
===================================================== */

function scheduleReconnect() {

    if (
        AF.reconnecting
    ) {
        return;
    }

    if (
        AF.reconnectAttempts >=
        AF.maxReconnectAttempts
    ) {

        showMessage(
            "❌ No se pudo reconectar"
        );

        return;
    }


    AF.reconnecting =
        true;

    AF.reconnectAttempts++;


    setTimeout(
        () => {

            AF.reconnecting =
                false;

            connectToServer();

        },
        AF.reconnectDelay
    );
}


/* =====================================================
   BOTONES DEL HTML
===================================================== */

function setupButtons() {

    /*
       Crear sala
    */

    const createButtons = [

        getElement(
            "createRoomButton",
            "createRoomBtn"
        )

    ].filter(Boolean);


    for (
        const button
        of createButtons
    ) {

        button.addEventListener(
            "click",
            () => {

                createRoom(
                    AF.plane
                );

            }
        );
    }


    /*
       Partida al azar
    */

    const randomButtons = [

        getElement(
            "randomMatchButton",
            "randomMatchBtn",
            "findMatchButton"
        )

    ].filter(Boolean);


    for (
        const button
        of randomButtons
    ) {

        button.addEventListener(
            "click",
            () => {

                findMatch(
                    AF.plane
                );

            }
        );
    }


    /*
       Unirse por código
    */

    const joinButtons = [

        getElement(
            "joinRoomButton",
            "joinRoomBtn"
        )

    ].filter(Boolean);


    for (
        const button
        of joinButtons
    ) {

        button.addEventListener(
            "click",
            () => {

                const input =
                    getElement(
                        "roomCodeInput",
                        "joinRoomInput",
                        "roomInput"
                    );

                if (!input) {
                    return;
                }

                joinRoom(
                    input.value,
                    AF.plane
                );

            }
        );
    }


    /*
       Salir
    */

    const leaveButtons = [

        getElement(
            "leaveRoomButton",
            "leaveRoomBtn"
        )

    ].filter(Boolean);


    for (
        const button
        of leaveButtons
    ) {

        button.addEventListener(
            "click",
            leaveRoom
        );
    }


    /*
       Iniciar
    */

    const startButtons = [

        getElement(
            "startMatchButton",
            "startMatchBtn"
        )

    ].filter(Boolean);


    for (
        const button
        of startButtons
    ) {

        button.addEventListener(
            "click",
            startMatch
        );
    }
}


/* =====================================================
   PLANO
===================================================== */

function setPlane(plane) {

    const number =
        Number(plane);

    if (
        !Number.isInteger(
            number
        )
    ) {
        return;
    }

    if (
        number < 0 ||
        number > 13
    ) {
        return;
    }

    AF.plane =
        number;
}


/* =====================================================
   INICIALIZACIÓN
===================================================== */

function initializeAIRFLIGHT() {

    if (
        AF.initialized
    ) {
        return;
    }

    AF.initialized =
        true;


    loadSession();

    setupButtons();

    updateConnectionUI();

    updateHealthUI();

    updateStatsUI();

    updateMatchUI();

    connectToServer();


    console.log(
        "✈️ AIR FLIGHT SCRIPT.JS INICIADO"
    );
}


/* =====================================================
   API GLOBAL
===================================================== */

window.AIR_FLIGHT =
    {

        connect:
            connectToServer,

        send:
            sendMessage,

        createRoom:
            createRoom,

        joinRoom:
            joinRoom,

        findMatch:
            findMatch,

        join:
            joinMultiplayer,

        leaveRoom:
            leaveRoom,

        startMatch:
            startMatch,

        fireMissile:
            fireMissile,

        updatePlayer:
            sendPlayerUpdate,

        setPlane:
            setPlane,

        getPlayers:
            () =>
                Array.from(
                    AF.players.values()
                ),

        getMissiles:
            () =>
                Array.from(
                    AF.missiles.values()
                ),

        getState:
            () => ({
                connected:
                    AF.connected,

                playerId:
                    AF.playerId,

                roomCode:
                    AF.roomCode,

                gameState:
                    AF.gameState,

                health:
                    AF.health,

                maxHealth:
                    AF.maxHealth,

                alive:
                    AF.alive,

                kills:
                    AF.kills,

                deaths:
                    AF.deaths,

                score:
                    AF.score,

                timeRemaining:
                    AF.timeRemaining
            })

    };


/* =====================================================
   INICIAR CUANDO CARGUE EL HTML
===================================================== */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeAIRFLIGHT
    );

} else {

    initializeAIRFLIGHT();
}