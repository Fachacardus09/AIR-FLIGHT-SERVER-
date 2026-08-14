/* =====================================================
   AIR FLIGHT
   public/script.js

   CLIENTE MULTIJUGADOR
   Compatible con el server.js proporcionado.
===================================================== */

"use strict";

/* =====================================================
   CONFIGURACIÓN
===================================================== */

const AIR_FLIGHT = {

    socket: null,

    connected: false,

    connecting: false,

    reconnecting: false,

    reconnectAttempts: 0,

    reconnectTimer: null,

    reconnectDelay: 1500,

    maxReconnectDelay: 10000,

    id: null,

    reconnectToken: null,

    room: null,

    isHost: false,

    gameState: "waiting",

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

    lastPlayerUpdate: 0,

    playerUpdateInterval: 50,

    missileSpeed: 2,

    events: {},

    initialized: false
};


/* =====================================================
   UTILIDADES
===================================================== */

function AF_log(...args) {

    console.log(
        "[AIR FLIGHT]",
        ...args
    );
}


function AF_warn(...args) {

    console.warn(
        "[AIR FLIGHT]",
        ...args
    );
}


function AF_error(...args) {

    console.error(
        "[AIR FLIGHT]",
        ...args
    );
}


/* =====================================================
   EVENTOS DEL CLIENTE
===================================================== */

function AF_on(
    event,
    callback
) {

    if (
        typeof callback !==
        "function"
    ) {
        return;
    }

    if (
        !AIR_FLIGHT.events[event]
    ) {

        AIR_FLIGHT.events[event] =
            [];
    }

    AIR_FLIGHT.events[event].push(
        callback
    );
}


function AF_emit(
    event,
    data
) {

    const callbacks =
        AIR_FLIGHT.events[event];

    if (!callbacks) {
        return;
    }

    for (
        const callback
        of callbacks
    ) {

        try {

            callback(data);

        } catch (error) {

            AF_error(
                "Error en evento:",
                event,
                error
            );
        }
    }
}


/* =====================================================
   CREAR CONEXIÓN
===================================================== */

function conectarServidor() {

    if (
        AIR_FLIGHT.connected ||
        AIR_FLIGHT.connecting
    ) {
        return;
    }

    AIR_FLIGHT.connecting =
        true;

    let protocol;

    if (
        location.protocol ===
        "https:"
    ) {

        protocol = "wss:";

    } else {

        protocol = "ws:";
    }

    const url =
        protocol +
        "//" +
        location.host;

    AF_log(
        "Conectando a:",
        url
    );

    let socket;

    try {

        socket =
            new WebSocket(url);

    } catch (error) {

        AIR_FLIGHT.connecting =
            false;

        AF_error(
            "No se pudo crear WebSocket:",
            error
        );

        programarReconectar();

        return;
    }

    AIR_FLIGHT.socket =
        socket;

    socket.addEventListener(
        "open",
        manejarConexionAbierta
    );

    socket.addEventListener(
        "message",
        manejarMensaje
    );

    socket.addEventListener(
        "close",
        manejarConexionCerrada
    );

    socket.addEventListener(
        "error",
        manejarError
    );
}


/* =====================================================
   CONEXIÓN ABIERTA
===================================================== */

function manejarConexionAbierta() {

    AIR_FLIGHT.connected =
        true;

    AIR_FLIGHT.connecting =
        false;

    AIR_FLIGHT.reconnecting =
        false;

    AIR_FLIGHT.reconnectAttempts =
        0;

    AF_log(
        "✈️ Conectado al servidor"
    );

    AF_emit(
        "connected"
    );

    /*
       Si ya teníamos una sesión,
       intentar reconectar.
    */

    if (
        AIR_FLIGHT.id &&
        AIR_FLIGHT.reconnectToken
    ) {

        enviar({
            type:
                "reconnect",

            id:
                AIR_FLIGHT.id,

            reconnectToken:
                AIR_FLIGHT.reconnectToken
        });
    }
}


/* =====================================================
   CONEXIÓN CERRADA
===================================================== */

function manejarConexionCerrada() {

    AIR_FLIGHT.connected =
        false;

    AIR_FLIGHT.connecting =
        false;

    AF_warn(
        "❌ Desconectado del servidor"
    );

    AF_emit(
        "disconnected"
    );

    programarReconectar();
}


/* =====================================================
   ERROR
===================================================== */

function manejarError(
    error
) {

    AF_error(
        "❌ WebSocket:",
        error
    );

    AF_emit(
        "connectionError",
        error
    );
}


/* =====================================================
   RECONEXIÓN AUTOMÁTICA
===================================================== */

function programarReconectar() {

    if (
        AIR_FLIGHT.reconnectTimer
    ) {
        return;
    }

    AIR_FLIGHT.reconnecting =
        true;

    AIR_FLIGHT.reconnectAttempts++;

    const delay =
        Math.min(
            AIR_FLIGHT.reconnectDelay *
            AIR_FLIGHT.reconnectAttempts,
            AIR_FLIGHT.maxReconnectDelay
        );

    AF_log(
        `🔄 Reconectando en ${delay} ms...`
    );

    AIR_FLIGHT.reconnectTimer =
        setTimeout(
            () => {

                AIR_FLIGHT.reconnectTimer =
                    null;

                conectarServidor();

            },
            delay
        );
}


/* =====================================================
   ENVIAR MENSAJE
===================================================== */

function enviar(
    data
) {

    if (
        !AIR_FLIGHT.socket ||
        AIR_FLIGHT.socket.readyState !==
            WebSocket.OPEN
    ) {

        AF_warn(
            "No conectado. Mensaje no enviado:",
            data
        );

        return false;
    }

    try {

        AIR_FLIGHT.socket.send(
            JSON.stringify(data)
        );

        return true;

    } catch (error) {

        AF_error(
            "Error enviando mensaje:",
            error
        );

        return false;
    }
}


/* =====================================================
   PROCESAR MENSAJE
===================================================== */

function manejarMensaje(
    event
) {

    let data;

    try {

        data =
            JSON.parse(
                event.data
            );

    } catch (error) {

        AF_error(
            "Mensaje inválido:",
            event.data
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

    AF_emit(
        "message",
        data
    );

    switch (
        data.type
    ) {

        case "welcome":
            manejarWelcome(data);
            break;

        case "reconnected":
            manejarReconnected(data);
            break;

        case "reconnectError":
            manejarReconnectError(data);
            break;

        case "roomCreated":
            manejarRoomCreated(data);
            break;

        case "roomJoined":
            manejarRoomJoined(data);
            break;

        case "roomError":
            manejarRoomError(data);
            break;

        case "publicMatchCreated":
            manejarPublicMatchCreated(data);
            break;

        case "playerJoined":
            manejarPlayerJoined(data);
            break;

        case "playerLeft":
            manejarPlayerLeft(data);
            break;

        case "playerDisconnected":
            manejarPlayerDisconnected(data);
            break;

        case "playerReconnected":
            manejarPlayerReconnected(data);
            break;

        case "roomPlayers":
            manejarRoomPlayers(data);
            break;

        case "roomHost":
            manejarRoomHost(data);
            break;

        case "gameStarted":
            manejarGameStarted(data);
            break;

        case "gameWaiting":
            manejarGameWaiting(data);
            break;

        case "matchTime":
            manejarMatchTime(data);
            break;

        case "gameEnded":
            manejarGameEnded(data);
            break;

        case "playerUpdate":
            manejarPlayerUpdate(data);
            break;

        case "scoreUpdate":
            manejarScoreUpdate(data);
            break;

        case "playerDamaged":
            manejarPlayerDamaged(data);
            break;

        case "playerDestroyed":
            manejarPlayerDestroyed(data);
            break;

        case "playerRespawned":
            manejarPlayerRespawned(data);
            break;

        case "killConfirmed":
            manejarKillConfirmed(data);
            break;

        case "missileCreated":
            manejarMissileCreated(data);
            break;

        case "missileUpdate":
            manejarMissileUpdate(data);
            break;

        case "missileHit":
            manejarMissileHit(data);
            break;

        case "missileRemoved":
            manejarMissileRemoved(data);
            break;

        case "leftRoom":
            manejarLeftRoom(data);
            break;

        case "error":
            manejarServerError(data);
            break;

        default:

            AF_log(
                "Mensaje no manejado:",
                data.type,
                data
            );

            break;
    }
}


/* =====================================================
   WELCOME
===================================================== */

function manejarWelcome(
    data
) {

    AIR_FLIGHT.id =
        data.id || null;

    AIR_FLIGHT.reconnectToken =
        data.reconnectToken || null;

    AIR_FLIGHT.maxHealth =
        Number(
            data.maxHealth
        ) || 100;

    AIR_FLIGHT.health =
        Number(
            data.health
        ) || AIR_FLIGHT.maxHealth;

    AIR_FLIGHT.alive =
        data.alive !== false;

    AIR_FLIGHT.kills =
        Number(data.kills) || 0;

    AIR_FLIGHT.deaths =
        Number(data.deaths) || 0;

    AIR_FLIGHT.score =
        Number(data.score) || 0;

    guardarSesion();

    AF_log(
        "👤 Jugador creado:",
        AIR_FLIGHT.id
    );

    AF_emit(
        "welcome",
        data
    );

    actualizarUI();
}


/* =====================================================
   RECONNECTED
===================================================== */

function manejarReconnected(
    data
) {

    AIR_FLIGHT.id =
        data.id;

    AIR_FLIGHT.room =
        data.room || null;

    AIR_FLIGHT.reconnectToken =
        data.reconnectToken ||
        AIR_FLIGHT.reconnectToken;

    AIR_FLIGHT.maxHealth =
        Number(
            data.maxHealth
        ) || 100;

    AIR_FLIGHT.health =
        Number(
            data.health
        ) || AIR_FLIGHT.maxHealth;

    AIR_FLIGHT.alive =
        data.alive !== false;

    AIR_FLIGHT.kills =
        Number(data.kills) || 0;

    AIR_FLIGHT.deaths =
        Number(data.deaths) || 0;

    AIR_FLIGHT.score =
        Number(data.score) || 0;

    guardarSesion();

    AF_log(
        "🔄 Sesión reconectada"
    );

    AF_emit(
        "reconnected",
        data
    );

    actualizarUI();
}


/* =====================================================
   ERROR DE RECONEXIÓN
===================================================== */

function manejarReconnectError(
    data
) {

    AF_warn(
        "Reconexión rechazada:",
        data.message
    );

    /*
       Si el token dejó de ser válido,
       conservamos la conexión pero
       borramos la sesión vieja.
    */

    borrarSesion();

    AIR_FLIGHT.id = null;

    AIR_FLIGHT.reconnectToken =
        null;

    AF_emit(
        "reconnectError",
        data
    );
}


/* =====================================================
   CREAR SALA
===================================================== */

function crearSala(
    plane = AIR_FLIGHT.plane
) {

    AIR_FLIGHT.plane =
        Number.isInteger(
            Number(plane)
        )
            ? Number(plane)
            : 0;

    enviar({

        type:
            "createRoom",

        plane:
            AIR_FLIGHT.plane
    });
}


/* =====================================================
   SALA CREADA
===================================================== */

function manejarRoomCreated(
    data
) {

    AIR_FLIGHT.room =
        data.room || null;

    AIR_FLIGHT.isHost =
        data.host === true;

    AIR_FLIGHT.gameState =
        "waiting";

    AF_log(
        "🏠 Sala creada:",
        AIR_FLIGHT.room
    );

    AF_emit(
        "roomCreated",
        data
    );

    actualizarUI();
}


/* =====================================================
   UNIRSE POR CÓDIGO
===================================================== */

function unirseASala(
    roomCode,
    plane = AIR_FLIGHT.plane
) {

    const code =
        String(
            roomCode || ""
        )
        .trim()
        .toUpperCase();

    if (!code) {

        mostrarMensaje(
            "Ingresá un código de sala."
        );

        return;
    }

    AIR_FLIGHT.plane =
        Number.isInteger(
            Number(plane)
        )
            ? Number(plane)
            : 0;

    enviar({

        type:
            "joinRoom",

        room:
            code,

        plane:
            AIR_FLIGHT.plane
    });
}


/* =====================================================
   SALA UNIDA
===================================================== */

function manejarRoomJoined(
    data
) {

    AIR_FLIGHT.room =
        data.room || null;

    AIR_FLIGHT.isHost =
        data.host === true;

    AIR_FLIGHT.gameState =
        data.gameState ||
        "waiting";

    AF_log(
        "👥 Unido a sala:",
        AIR_FLIGHT.room
    );

    AF_emit(
        "roomJoined",
        data
    );

    actualizarUI();
}


/* =====================================================
   ERROR DE SALA
===================================================== */

function manejarRoomError(
    data
) {

    AF_warn(
        "Error de sala:",
        data.message
    );

    mostrarMensaje(
        data.message ||
        "Error de sala."
    );

    AF_emit(
        "roomError",
        data
    );
}


/* =====================================================
   BUSCAR PARTIDA AL AZAR
===================================================== */

function buscarPartida(
    plane = AIR_FLIGHT.plane
) {

    AIR_FLIGHT.plane =
        Number.isInteger(
            Number(plane)
        )
            ? Number(plane)
            : 0;

    enviar({

        type:
            "findMatch",

        plane:
            AIR_FLIGHT.plane
    });
}


/* =====================================================
   SALA PÚBLICA CREADA
===================================================== */

function manejarPublicMatchCreated(
    data
) {

    AIR_FLIGHT.room =
        data.room || null;

    AF_log(
        "🎮 Partida pública:",
        AIR_FLIGHT.room
    );

    AF_emit(
        "publicMatchCreated",
        data
    );

    actualizarUI();
}


/* =====================================================
   ENTRAR AL MULTIJUGADOR
===================================================== */

function entrarMultijugador(
    plane = AIR_FLIGHT.plane
) {

    AIR_FLIGHT.plane =
        Number.isInteger(
            Number(plane)
        )
            ? Number(plane)
            : 0;

    enviar({

        type:
            "join",

        plane:
            AIR_FLIGHT.plane
    });
}


/* =====================================================
   PLAYER JOINED
===================================================== */

function manejarPlayerJoined(
    data
) {

    AF_log(
        "✈️ Jugador entró:",
        data.id
    );

    if (
        data.id &&
        data.id !== AIR_FLIGHT.id
    ) {

        let player =
            AIR_FLIGHT.players.get(
                data.id
            );

        if (!player) {

            player = crearJugadorLocal(
                data.id
            );

            AIR_FLIGHT.players.set(
                data.id,
                player
            );
        }

        if (
            Number.isInteger(
                data.plane
            )
        ) {

            player.plane =
                data.plane;
        }
    }

    AF_emit(
        "playerJoined",
        data
    );

    actualizarUI();
}


/* =====================================================
   PLAYER LEFT
===================================================== */

function manejarPlayerLeft(
    data
) {

    if (data.id) {

        AIR_FLIGHT.players.delete(
            data.id
        );

        destruirJugadorVisual(
            data.id
        );
    }

    AF_emit(
        "playerLeft",
        data
    );

    actualizarUI();
}


/* =====================================================
   PLAYER DISCONNECTED
===================================================== */

function manejarPlayerDisconnected(
    data
) {

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );

    if (player) {

        player.connected =
            false;
    }

    AF_emit(
        "playerDisconnected",
        data
    );

    actualizarUI();
}


/* =====================================================
   PLAYER RECONNECTED
===================================================== */

function manejarPlayerReconnected(
    data
) {

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );

    if (player) {

        player.connected =
            true;
    }

    AF_emit(
        "playerReconnected",
        data
    );

    actualizarUI();
}


/* =====================================================
   LISTA COMPLETA DE JUGADORES
===================================================== */

function manejarRoomPlayers(
    data
) {

    AIR_FLIGHT.room =
        data.room ||
        AIR_FLIGHT.room;

    AIR_FLIGHT.gameState =
        data.gameState ||
        AIR_FLIGHT.gameState;

    AIR_FLIGHT.timeRemaining =
        Number(
            data.timeRemaining
        ) || 0;

    const received =
        new Set();

    if (
        Array.isArray(
            data.players
        )
    ) {

        for (
            const serverPlayer
            of data.players
        ) {

            if (!serverPlayer.id) {
                continue;
            }

            received.add(
                serverPlayer.id
            );

            if (
                serverPlayer.id ===
                AIR_FLIGHT.id
            ) {

                actualizarJugadorLocal(
                    serverPlayer
                );

                continue;
            }

            let player =
                AIR_FLIGHT.players.get(
                    serverPlayer.id
                );

            if (!player) {

                player =
                    crearJugadorLocal(
                        serverPlayer.id
                    );

                AIR_FLIGHT.players.set(
                    serverPlayer.id,
                    player
                );
            }

            copiarEstadoJugador(
                player,
                serverPlayer
            );
        }
    }

    /*
       Eliminar jugadores que ya
       no aparecen en la lista.
    */

    for (
        const [
            id
        ]
        of AIR_FLIGHT.players
    ) {

        if (
            !received.has(id)
        ) {

            AIR_FLIGHT.players.delete(
                id
            );

            destruirJugadorVisual(
                id
            );
        }
    }

    AF_emit(
        "roomPlayers",
        data
    );

    actualizarUI();
}


/* =====================================================
   NUEVO JUGADOR LOCAL EN CLIENTE
===================================================== */

function crearJugadorLocal(
    id
) {

    return {

        id:
            id,

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
            100,

        health:
            100,

        alive:
            true,

        kills:
            0,

        deaths:
            0,

        score:
            0,

        connected:
            true,

        object:
            null
    };
}


/* =====================================================
   COPIAR ESTADO
===================================================== */

function copiarEstadoJugador(
    target,
    source
) {

    target.x =
        Number(source.x) || 0;

    target.y =
        Number(source.y) || 0;

    target.z =
        Number(source.z) || 0;

    target.rotationX =
        Number(source.rotationX) || 0;

    target.rotationY =
        Number(source.rotationY) || 0;

    target.rotationZ =
        Number(source.rotationZ) || 0;

    target.plane =
        Number(source.plane) || 0;

    target.maxHealth =
        Number(source.maxHealth) || 100;

    target.health =
        Number(source.health) || 0;

    target.alive =
        source.alive !== false;

    target.kills =
        Number(source.kills) || 0;

    target.deaths =
        Number(source.deaths) || 0;

    target.score =
        Number(source.score) || 0;

    target.connected =
        source.connected !== false;

    AF_emit(
        "remotePlayerUpdate",
        target
    );
}


/* =====================================================
   ACTUALIZAR JUGADOR LOCAL
===================================================== */

function actualizarJugadorLocal(
    data
) {

    AIR_FLIGHT.health =
        Number(data.health) ||
        0;

    AIR_FLIGHT.maxHealth =
        Number(data.maxHealth) ||
        100;

    AIR_FLIGHT.alive =
        data.alive !== false;

    AIR_FLIGHT.kills =
        Number(data.kills) || 0;

    AIR_FLIGHT.deaths =
        Number(data.deaths) || 0;

    AIR_FLIGHT.score =
        Number(data.score) || 0;

    AIR_FLIGHT.plane =
        Number(data.plane) || 0;

    AF_emit(
        "localPlayerState",
        data
    );

    actualizarUI();
}


/* =====================================================
   HOST
===================================================== */

function manejarRoomHost(
    data
) {

    AIR_FLIGHT.isHost =
        true;

    AF_log(
        "👑 Ahora sos el creador de la sala"
    );

    AF_emit(
        "roomHost",
        data
    );

    actualizarUI();
}


/* =====================================================
   INICIAR PARTIDA
===================================================== */

function iniciarPartida() {

    if (
        !AIR_FLIGHT.room
    ) {

        mostrarMensaje(
            "No estás en una sala."
        );

        return;
    }

    enviar({

        type:
            "startMatch"
    });
}


/* =====================================================
   PARTIDA INICIADA
===================================================== */

function manejarGameStarted(
    data
) {

    AIR_FLIGHT.gameState =
        "playing";

    AIR_FLIGHT.timeRemaining =
        Number(
            data.timeRemaining
        ) ||
        Number(
            data.duration
        ) ||
        0;

    /*
       Limpiar misiles anteriores.
    */

    AIR_FLIGHT.missiles.clear();

    AF_log(
        "🚀 ¡Partida iniciada!"
    );

    AF_emit(
        "gameStarted",
        data
    );

    actualizarUI();
}


/* =====================================================
   PARTIDA EN ESPERA
===================================================== */

function manejarGameWaiting(
    data
) {

    AIR_FLIGHT.gameState =
        "waiting";

    AF_log(
        "⏸️ Partida en espera:",
        data.reason
    );

    AF_emit(
        "gameWaiting",
        data
    );

    actualizarUI();
}


/* =====================================================
   TIEMPO
===================================================== */

function manejarMatchTime(
    data
) {

    AIR_FLIGHT.timeRemaining =
        Math.max(
            0,
            Number(
                data.timeRemaining
            ) || 0
        );

    AF_emit(
        "matchTime",
        AIR_FLIGHT.timeRemaining
    );

    actualizarUI();
}


/* =====================================================
   FINAL DE PARTIDA
===================================================== */

function manejarGameEnded(
    data
) {

    AIR_FLIGHT.gameState =
        "finished";

    AIR_FLIGHT.timeRemaining =
        0;

    AF_log(
        "🏁 Partida terminada"
    );

    AF_emit(
        "gameEnded",
        data
    );

    mostrarRanking(
        data.ranking || []
    );

    actualizarUI();
}


/* =====================================================
   ACTUALIZAR POSICIÓN DEL JUGADOR
===================================================== */

function actualizarJugador(
    x,
    y,
    z,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    plane = AIR_FLIGHT.plane
) {

    const now =
        Date.now();

    if (
        now -
        AIR_FLIGHT.lastPlayerUpdate <
        AIR_FLIGHT.playerUpdateInterval
    ) {

        return;
    }

    AIR_FLIGHT.lastPlayerUpdate =
        now;

    const nx =
        Number(x);

    const ny =
        Number(y);

    const nz =
        Number(z);

    if (
        !Number.isFinite(nx) ||
        !Number.isFinite(ny) ||
        !Number.isFinite(nz)
    ) {

        return;
    }

    enviar({

        type:
            "playerUpdate",

        x:
            nx,

        y:
            ny,

        z:
            nz,

        rotationX:
            Number(rotationX) || 0,

        rotationY:
            Number(rotationY) || 0,

        rotationZ:
            Number(rotationZ) || 0,

        plane:
            Number.isInteger(
                Number(plane)
            )
                ? Number(plane)
                : AIR_FLIGHT.plane
    });
}


/* =====================================================
   ALIAS
===================================================== */

function enviarPosicion(
    x,
    y,
    z,
    rotationX,
    rotationY,
    rotationZ,
    plane
) {

    actualizarJugador(
        x,
        y,
        z,
        rotationX,
        rotationY,
        rotationZ,
        plane
    );
}


/* =====================================================
   PLAYER UPDATE REMOTO
===================================================== */

function manejarPlayerUpdate(
    data
) {

    if (
        !data.id ||
        data.id === AIR_FLIGHT.id
    ) {
        return;
    }

    let player =
        AIR_FLIGHT.players.get(
            data.id
        );

    if (!player) {

        player =
            crearJugadorLocal(
                data.id
            );

        AIR_FLIGHT.players.set(
            data.id,
            player
        );
    }

    copiarEstadoJugador(
        player,
        data
    );

    actualizarAvionVisual(
        player
    );

    AF_emit(
        "playerUpdate",
        player
    );
}


/* =====================================================
   ESTADÍSTICAS
===================================================== */

function manejarScoreUpdate(
    data
) {

    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        AIR_FLIGHT.score =
            Number(data.score) || 0;

        AIR_FLIGHT.kills =
            Number(data.kills) || 0;

        AIR_FLIGHT.deaths =
            Number(data.deaths) || 0;

        actualizarUI();

    } else {

        const player =
            AIR_FLIGHT.players.get(
                data.id
            );

        if (player) {

            player.score =
                Number(data.score) || 0;

            player.kills =
                Number(data.kills) || 0;

            player.deaths =
                Number(data.deaths) || 0;
        }
    }

    AF_emit(
        "scoreUpdate",
        data
    );
}


/* =====================================================
   DAÑO
===================================================== */

function manejarPlayerDamaged(
    data
) {

    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        AIR_FLIGHT.health =
            Math.max(
                0,
                Number(data.health) || 0
            );

        AIR_FLIGHT.maxHealth =
            Number(
                data.maxHealth
            ) || 100;

        AIR_FLIGHT.alive =
            data.alive !== false;

        actualizarUI();
    }

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );

    if (player) {

        player.health =
            Number(data.health) || 0;

        player.maxHealth =
            Number(
                data.maxHealth
            ) || 100;

        player.alive =
            data.alive !== false;
    }

    AF_emit(
        "playerDamaged",
        data
    );
}


/* =====================================================
   DESTRUCCIÓN
===================================================== */

function manejarPlayerDestroyed(
    data
) {

    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        AIR_FLIGHT.health =
            0;

        AIR_FLIGHT.alive =
            false;

        actualizarUI();
    }

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );

    if (player) {

        player.health =
            0;

        player.alive =
            false;
    }

    AF_emit(
        "playerDestroyed",
        data
    );
}


/* =====================================================
   RESPAWN
===================================================== */

function manejarPlayerRespawned(
    data
) {

    if (
        data.id ===
        AIR_FLIGHT.id
    ) {

        AIR_FLIGHT.health =
            Number(data.health) ||
            AIR_FLIGHT.maxHealth;

        AIR_FLIGHT.maxHealth =
            Number(data.maxHealth) ||
            AIR_FLIGHT.maxHealth;

        AIR_FLIGHT.alive =
            true;

        actualizarUI();
    }

    const player =
        AIR_FLIGHT.players.get(
            data.id
        );

    if (player) {

        copiarEstadoJugador(
            player,
            data
        );

        actualizarAvionVisual(
            player
        );
    }

    AF_emit(
        "playerRespawned",
        data
    );
}


/* =====================================================
   KILL CONFIRMED
===================================================== */

function manejarKillConfirmed(
    data
) {

    if (
        data.attackerId ===
        AIR_FLIGHT.id
    ) {

        if (
            Number.isFinite(
                Number(
                    data.attackerKills
                )
            )
        ) {

            AIR_FLIGHT.kills =
                Number(
                    data.attackerKills
                );
        }

        if (
            Number.isFinite(
                Number(
                    data.attackerScore
                )
            )
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
            Number.isFinite(
                Number(
                    data.victimDeaths
                )
            )
        ) {

            AIR_FLIGHT.deaths =
                Number(
                    data.victimDeaths
                );
        }
    }

    actualizarUI();

    AF_emit(
        "killConfirmed",
        data
    );
}


/* =====================================================
   DISPARAR MISIL
===================================================== */

function dispararMisil(
    x,
    y,
    z,
    velocityX,
    velocityY,
    velocityZ
) {

    if (
        !AIR_FLIGHT.alive
    ) {
        return false;
    }

    const values = [
        x,
        y,
        z,
        velocityX,
        velocityY,
        velocityZ
    ];

    for (
        const value
        of values
    ) {

        if (
            !Number.isFinite(
                Number(value)
            )
        ) {

            AF_warn(
                "Datos de misil inválidos."
            );

            return false;
        }
    }

    return enviar({

        type:
            "fireMissile",

        x:
            Number(x),

        y:
            Number(y),

        z:
            Number(z),

        velocityX:
            Number(velocityX),

        velocityY:
            Number(velocityY),

        velocityZ:
            Number(velocityZ)
    });
}


/* =====================================================
   MISIL CREADO
===================================================== */

function manejarMissileCreated(
    data
) {

    if (!data.id) {
        return;
    }

    const missile = {

        id:
            data.id,

        ownerId:
            data.ownerId,

        x:
            Number(data.x) || 0,

        y:
            Number(data.y) || 0,

        z:
            Number(data.z) || 0,

        velocityX:
            Number(data.velocityX) || 0,

        velocityY:
            Number(data.velocityY) || 0,

        velocityZ:
            Number(data.velocityZ) || 0,

        object:
            null
    };

    AIR_FLIGHT.missiles.set(
        data.id,
        missile
    );

    crearMisilVisual(
        missile
    );

    AF_emit(
        "missileCreated",
        missile
    );
}


/* =====================================================
   ACTUALIZAR MISIL
===================================================== */

function manejarMissileUpdate(
    data
) {

    const missile =
        AIR_FLIGHT.missiles.get(
            data.id
        );

    if (!missile) {
        return;
    }

    missile.x =
        Number(data.x) || 0;

    missile.y =
        Number(data.y) || 0;

    missile.z =
        Number(data.z) || 0;

    actualizarMisilVisual(
        missile
    );

    AF_emit(
        "missileUpdate",
        missile
    );
}


/* =====================================================
   MISIL IMPACTÓ
===================================================== */

function manejarMissileHit(
    data
) {

    AF_log(
        "💥 Misil impactó:",
        data.targetId
    );

    AF_emit(
        "missileHit",
        data
    );
}


/* =====================================================
   ELIMINAR MISIL
===================================================== */

function manejarMissileRemoved(
    data
) {

    const missile =
        AIR_FLIGHT.missiles.get(
            data.id
        );

    if (missile) {

        destruirMisilVisual(
            missile
        );
    }

    AIR_FLIGHT.missiles.delete(
        data.id
    );

    AF_emit(
        "missileRemoved",
        data
    );
}


/* =====================================================
   ELIMINAR MISIL MANUALMENTE
===================================================== */

function eliminarMisil(
    missileId
) {

    if (!missileId) {
        return;
    }

    enviar({

        type:
            "removeMissile",

        id:
            String(missileId)
    });
}


/* =====================================================
   DAÑO DIRECTO
===================================================== */

function recibirDaño(
    damage,
    attackerId = null,
    missileId = null
) {

    enviar({

        type:
            "damagePlayer",

        damage:
            Number(damage) || 0,

        attackerId:
            attackerId,

        missileId:
            missileId
    });
}


/* =====================================================
   SALIR DE SALA
===================================================== */

function salirDeSala() {

    if (
        !AIR_FLIGHT.room
    ) {
        return;
    }

    enviar({

        type:
            "leaveRoom"
    });
}


/* =====================================================
   LEFT ROOM
===================================================== */

function manejarLeftRoom(
    data
) {

    AIR_FLIGHT.room =
        null;

    AIR_FLIGHT.isHost =
        false;

    AIR_FLIGHT.gameState =
        "waiting";

    AIR_FLIGHT.players.clear();

    AIR_FLIGHT.missiles.clear();

    AF_log(
        "🚪 Saliste de la sala"
    );

    AF_emit(
        "leftRoom",
        data
    );

    actualizarUI();
}


/* =====================================================
   ERROR DEL SERVIDOR
===================================================== */

function manejarServerError(
    data
) {

    AF_error(
        "Servidor:",
        data.message
    );

    mostrarMensaje(
        data.message ||
        "Error del servidor."
    );

    AF_emit(
        "serverError",
        data
    );
}


/* =====================================================
   FORMATEAR TIEMPO
===================================================== */

function formatearTiempo(
    milliseconds
) {

    const totalSeconds =
        Math.max(
            0,
            Math.ceil(
                Number(milliseconds) /
                1000
            )
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
   RANKING
===================================================== */

function mostrarRanking(
    ranking
) {

    if (
        !Array.isArray(ranking)
    ) {
        return;
    }

    AF_log(
        "🏆 RANKING"
    );

    for (
        const player
        of ranking
    ) {

        AF_log(
            player.position,
            player.id,
            "Score:",
            player.score,
            "Kills:",
            player.kills,
            "Muertes:",
            player.deaths
        );
    }

    AF_emit(
        "ranking",
        ranking
    );
}


/* =====================================================
   MENSAJE UI
===================================================== */

function mostrarMensaje(
    message
) {

    AF_emit(
        "notification",
        String(message)
    );

    /*
       Si el index tiene un elemento
       #serverMessage, lo utilizamos.
    */

    const element =
        document.getElementById(
            "serverMessage"
        );

    if (element) {

        element.textContent =
            String(message);

        element.style.display =
            "block";

        clearTimeout(
            element._airFlightTimer
        );

        element._airFlightTimer =
            setTimeout(
                () => {

                    element.style.display =
                        "none";

                },
                3000
            );
    }
}


/* =====================================================
   ACTUALIZAR UI
===================================================== */

function actualizarUI() {

    AF_emit(
        "stateChanged",
        obtenerEstado()
    );

    /*
       Elementos opcionales.
       Si existen en el index.html,
       se actualizan automáticamente.
    */

    const roomElement =
        document.getElementById(
            "roomCode"
        );

    if (roomElement) {

        roomElement.textContent =
            AIR_FLIGHT.room ||
            "—";
    }

    const healthElement =
        document.getElementById(
            "health"
        );

    if (healthElement) {

        healthElement.textContent =
            `${AIR_FLIGHT.health}/${AIR_FLIGHT.maxHealth}`;
    }

    const killsElement =
        document.getElementById(
            "kills"
        );

    if (killsElement) {

        killsElement.textContent =
            String(
                AIR_FLIGHT.kills
            );
    }

    const deathsElement =
        document.getElementById(
            "deaths"
        );

    if (deathsElement) {

        deathsElement.textContent =
            String(
                AIR_FLIGHT.deaths
            );
    }

    const scoreElement =
        document.getElementById(
            "score"
        );

    if (scoreElement) {

        scoreElement.textContent =
            String(
                AIR_FLIGHT.score
            );
    }

    const timeElement =
        document.getElementById(
            "matchTime"
        );

    if (timeElement) {

        timeElement.textContent =
            formatearTiempo(
                AIR_FLIGHT.timeRemaining
            );
    }

    const connectionElement =
        document.getElementById(
            "connectionStatus"
        );

    if (connectionElement) {

        connectionElement.textContent =
            AIR_FLIGHT.connected
                ? "CONECTADO"
                : "DESCONECTADO";
    }
}


/* =====================================================
   ESTADO COMPLETO
===================================================== */

function obtenerEstado() {

    return {

        connected:
            AIR_FLIGHT.connected,

        id:
            AIR_FLIGHT.id,

        room:
            AIR_FLIGHT.room,

        isHost:
            AIR_FLIGHT.isHost,

        gameState:
            AIR_FLIGHT.gameState,

        timeRemaining:
            AIR_FLIGHT.timeRemaining,

        maxHealth:
            AIR_FLIGHT.maxHealth,

        health:
            AIR_FLIGHT.health,

        alive:
            AIR_FLIGHT.alive,

        kills:
            AIR_FLIGHT.kills,

        deaths:
            AIR_FLIGHT.deaths,

        score:
            AIR_FLIGHT.score,

        plane:
            AIR_FLIGHT.plane,

        players:
            AIR_FLIGHT.players,

        missiles:
            AIR_FLIGHT.missiles
    };
}


/* =====================================================
   SESIÓN LOCAL
===================================================== */

function guardarSesion() {

    try {

        if (
            AIR_FLIGHT.id &&
            AIR_FLIGHT.reconnectToken
        ) {

            localStorage.setItem(
                "airFlightPlayerId",
                AIR_FLIGHT.id
            );

            localStorage.setItem(
                "airFlightReconnectToken",
                AIR_FLIGHT.reconnectToken
            );
        }

    } catch (error) {

        AF_warn(
            "No se pudo guardar la sesión."
        );
    }
}


/* =====================================================
   CARGAR SESIÓN
===================================================== */

function cargarSesion() {

    try {

        AIR_FLIGHT.id =
            localStorage.getItem(
                "airFlightPlayerId"
            );

        AIR_FLIGHT.reconnectToken =
            localStorage.getItem(
                "airFlightReconnectToken"
            );

    } catch (error) {

        AIR_FLIGHT.id =
            null;

        AIR_FLIGHT.reconnectToken =
            null;
    }
}


/* =====================================================
   BORRAR SESIÓN
===================================================== */

function borrarSesion() {

    try {

        localStorage.removeItem(
            "airFlightPlayerId"
        );

        localStorage.removeItem(
            "airFlightReconnectToken"
        );

    } catch {
        /* Ignorar */
    }
}


/* =====================================================
   FUNCIONES VISUALES
   ESTAS FUNCIONES NO ROMPEN EL JUEGO SI
   TODAVÍA NO TENÉS EL MOTOR 3D CONECTADO.
===================================================== */

function actualizarAvionVisual(
    player
) {

    /*
       El juego 3D puede escuchar este evento
       y mover el avión correspondiente.
    */

    AF_emit(
        "updatePlaneVisual",
        player
    );
}


function destruirJugadorVisual(
    id
) {

    AF_emit(
        "destroyPlayerVisual",
        id
    );
}


function crearMisilVisual(
    missile
) {

    AF_emit(
        "createMissileVisual",
        missile
    );
}


function actualizarMisilVisual(
    missile
) {

    AF_emit(
        "updateMissileVisual",
        missile
    );
}


function destruirMisilVisual(
    missile
) {

    AF_emit(
        "destroyMissileVisual",
        missile
    );
}


/* =====================================================
   API PÚBLICA
   HACEMOS LAS FUNCIONES ACCESIBLES DESDE
   LOS BOTONES DEL INDEX.HTML.
===================================================== */

window.AIR_FLIGHT =
    AIR_FLIGHT;

window.conectarServidor =
    conectarServidor;

window.enviar =
    enviar;

window.crearSala =
    crearSala;

window.unirseASala =
    unirseASala;

window.buscarPartida =
    buscarPartida;

window.entrarMultijugador =
    entrarMultijugador;

window.salirDeSala =
    salirDeSala;

window.iniciarPartida =
    iniciarPartida;

window.actualizarJugador =
    actualizarJugador;

window.enviarPosicion =
    enviarPosicion;

window.dispararMisil =
    dispararMisil;

window.eliminarMisil =
    eliminarMisil;

window.recibirDaño =
    recibirDaño;

window.formatearTiempo =
    formatearTiempo;

window.obtenerEstado =
    obtenerEstado;

window.AF_on =
    AF_on;


/* =====================================================
   INICIALIZACIÓN
===================================================== */

function inicializarAIRFLIGHT() {

    if (
        AIR_FLIGHT.initialized
    ) {
        return;
    }

    AIR_FLIGHT.initialized =
        true;

    cargarSesion();

    AF_log(
        "✈️ AIR FLIGHT iniciando..."
    );

    conectarServidor();

    actualizarUI();
}


/* =====================================================
   INICIAR CUANDO CARGA EL HTML
===================================================== */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        inicializarAIRFLIGHT
    );

} else {

    inicializarAIRFLIGHT();
}


/* =====================================================
   EXPORTACIÓN PARA DEBUG
===================================================== */

window.AIR_FLIGHT_DEBUG = {

    estado:
        () => obtenerEstado(),

    jugadores:
        () => AIR_FLIGHT.players,

    misiles:
        () => AIR_FLIGHT.missiles,

    socket:
        () => AIR_FLIGHT.socket,

    reconectar:
        () => {

            if (
                AIR_FLIGHT.socket
            ) {

                try {
                    AIR_FLIGHT.socket.close();
                } catch {}
            }

            AIR_FLIGHT.connecting =
                false;

            AIR_FLIGHT.connected =
                false;

            conectarServidor();
        }
};


/* =====================================================
   FIN DEL SCRIPT
===================================================== */

AF_log(
    "✅ script.js cargado correctamente"
);