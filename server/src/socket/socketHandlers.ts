import type { Server, Socket } from "socket.io";
import { processAttack } from "../combat/combat";
import { KNOCKBACK_X, KNOCKBACK_Y } from "../config/constants";
import {
  addParticipant,
  canStartGame,
  createRoom,
  deleteRoom,
  getParticipantsMap,
  getRoom,
  removeParticipantById,
  removeParticipantBySocketId,
  setParticipantReady,
  startRoom,
} from "../state/rooms";
import {
  createOrReplacePlayer,
  getPlayerBySocketId,
  getRoomPlayers,
  removePlayerBySocketId,
  updatePlayerPosition,
} from "../state/players";
import type { ClientIdentity, Direction } from "../types/player";

const GAME_DURATION = 180;
const roomTimers: Record<string, ReturnType<typeof setInterval>> = {};

function startGameTimer(io: Server, roomId: string) {
  let remaining = GAME_DURATION;
  io.to(roomId).emit("timerUpdate", { remaining });

  const interval = setInterval(() => {
    remaining--;
    io.to(roomId).emit("timerUpdate", { remaining });

    if (remaining <= 0) {
      clearInterval(interval);
      delete roomTimers[roomId];
      const players = getRoomPlayers(roomId);
      const ranking = Object.values(players)
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map(({ id, name, kills, deaths }) => ({ id, name, kills, deaths }));
      io.to(roomId).emit("gameOver", { ranking });
      deleteRoom(roomId);
    }
  }, 1000);

  roomTimers[roomId] = interval;
}

function clearGameTimer(roomId: string) {
  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("Socket conectado:", socket.id);

    // ── LOBBY ─────────────────────────────────────────────────────────────────

    socket.on("createRoom", (identity: ClientIdentity) => {
      const room = createRoom(socket.id, identity.id, identity.name);
      socket.join(room.id);
      socket.emit("roomCreated", {
        roomId: room.id,
        participants: getParticipantsMap(room),
        isHost: true,
      });
    });

    socket.on("joinRoom", (data: { roomId: string; identity: ClientIdentity }) => {
      const result = addParticipant(data.roomId, socket.id, data.identity.id, data.identity.name);

      if (result === "notFound" || result === "started") {
        socket.emit("roomError", { message: "Sala no encontrada o ya iniciada." });
        return;
      }
      if (result === "full") {
        socket.emit("roomError", { message: "La sala está llena (máx. 4 jugadores)." });
        return;
      }

      const room = getRoom(data.roomId)!;
      socket.join(data.roomId);
      socket.emit("roomJoined", {
        roomId: data.roomId,
        participants: getParticipantsMap(room),
        isHost: false,
      });
      io.to(data.roomId).emit("participantsUpdated", { participants: getParticipantsMap(room) });
    });

    socket.on("toggleReady", (data: { roomId: string; playerId: string }) => {
      setParticipantReady(data.roomId, data.playerId);
      const room = getRoom(data.roomId);
      if (!room) return;
      io.to(data.roomId).emit("participantsUpdated", { participants: getParticipantsMap(room) });
    });

    socket.on("startGame", (data: { roomId: string }) => {
      const room = getRoom(data.roomId);
      if (!room || room.hostSocketId !== socket.id) return;
      if (!canStartGame(room)) return;
      startRoom(data.roomId);
      io.to(data.roomId).emit("gameStart");
      startGameTimer(io, data.roomId);
    });

    socket.on("leaveRoom", (data: { roomId: string; playerId: string }) => {
      const room = getRoom(data.roomId);
      if (!room) return;
      const wasHost = room.hostSocketId === socket.id;
      removeParticipantById(data.roomId, data.playerId);
      socket.leave(data.roomId);

      if (wasHost) {
        clearGameTimer(data.roomId);
        io.to(data.roomId).emit("hostLeft");
        deleteRoom(data.roomId);
      } else {
        const updated = getRoom(data.roomId);
        if (updated) {
          io.to(data.roomId).emit("participantsUpdated", { participants: getParticipantsMap(updated) });
        }
      }
    });

    // ── GAME ──────────────────────────────────────────────────────────────────

    socket.on("joinGame", (data: ClientIdentity & { name?: string; roomId?: string }) => {
      console.log("Jugador en juego:", data.name ?? data.id, data.id);

      const { player, previousSocketId, isReplacement } = createOrReplacePlayer(
        data,
        socket.id,
        data.roomId,
      );

      if (isReplacement && previousSocketId && previousSocketId !== socket.id) {
        io.to(previousSocketId).emit("duplicateConnection");
      }

      socket.emit("localPlayer", { id: player.id });

      const roomPlayers = getRoomPlayers(data.roomId);
      socket.emit("currentPlayers", roomPlayers);

      if (data.roomId) {
        socket.to(data.roomId).emit("playerJoined", player);
        io.to(data.roomId).emit("playersUpdated", roomPlayers);
      } else {
        socket.broadcast.emit("playerJoined", player);
        io.emit("playersUpdated", roomPlayers);
      }
    });

    socket.on("playerMove", (position: { x: number; y: number; direction: Direction }) => {
      const player = updatePlayerPosition(socket.id, position);
      if (!player) return;

      const moveData = { id: player.id, x: player.x, y: player.y, direction: player.direction };
      if (player.roomId) {
        socket.to(player.roomId).emit("playerMoved", moveData);
      } else {
        socket.broadcast.emit("playerMoved", moveData);
      }
    });

    socket.on("playerAttack", () => {
      const attacker = getPlayerBySocketId(socket.id);
      if (!attacker) return;

      const result = processAttack(attacker);
      if (!result.valid) return;

      const roomId = attacker.roomId;
      const attackData = {
        attackerId: attacker.id,
        x: attacker.x,
        y: attacker.y,
        direction: attacker.direction,
      };
      const kx = attacker.direction === "right" ? KNOCKBACK_X : -KNOCKBACK_X;
      const knockback = { x: kx, y: -KNOCKBACK_Y };
      const roomPlayers = getRoomPlayers(roomId);

      if (roomId) {
        io.to(roomId).emit("attackVisual", attackData);
        result.hitTargets.forEach((t) =>
          io.to(roomId).emit("hitVisual", { targetId: t.id, x: t.x, y: t.y, knockback }),
        );
        result.killedTargets.forEach((t) =>
          io.to(roomId).emit("playerKilled", { killerId: attacker.id, victimId: t.id }),
        );
        io.to(roomId).emit("playersUpdated", roomPlayers);
      } else {
        io.emit("attackVisual", attackData);
        result.hitTargets.forEach((t) =>
          io.emit("hitVisual", { targetId: t.id, x: t.x, y: t.y, knockback }),
        );
        result.killedTargets.forEach((t) =>
          io.emit("playerKilled", { killerId: attacker.id, victimId: t.id }),
        );
        io.emit("playersUpdated", roomPlayers);
      }
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      console.log("Socket desconectado:", socket.id);

      const lobbyResult = removeParticipantBySocketId(socket.id);
      if (lobbyResult) {
        const { room, wasHost } = lobbyResult;
        if (wasHost) {
          clearGameTimer(room.id);
          io.to(room.id).emit("hostLeft");
          deleteRoom(room.id);
        } else {
          const updated = getRoom(room.id);
          if (updated) {
            io.to(room.id).emit("participantsUpdated", { participants: getParticipantsMap(updated) });
          }
        }
      }

      const removedPlayer = removePlayerBySocketId(socket.id);
      if (!removedPlayer) return;

      const roomId = removedPlayer.roomId;
      if (roomId) {
        io.to(roomId).emit("playerLeft", removedPlayer.id);
        io.to(roomId).emit("playersUpdated", getRoomPlayers(roomId));
      } else {
        io.emit("playerLeft", removedPlayer.id);
        io.emit("playersUpdated", getRoomPlayers());
      }
    });
  });
}
