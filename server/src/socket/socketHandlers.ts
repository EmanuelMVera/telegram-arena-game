import type { Server, Socket } from "socket.io";
import { processAttack } from "../combat/combat";
import {
  createOrReplacePlayer,
  getPlayerBySocketId,
  getPlayers,
  removePlayerBySocketId,
  updatePlayerPosition,
} from "../state/players";
import type { ClientIdentity, Direction } from "../types/player";

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("Socket conectado:", socket.id);

    socket.on("joinGame", (identity: ClientIdentity) => {
      console.log("Jugador unido:", identity.name, identity.id);

      const { player, previousSocketId, isReplacement } = createOrReplacePlayer(
        identity,
        socket.id,
      );

      if (isReplacement && previousSocketId && previousSocketId !== socket.id) {
        io.to(previousSocketId).emit("duplicateConnection");
      }

      socket.emit("localPlayer", {
        id: player.id,
      });

      socket.emit("currentPlayers", getPlayers());
      socket.broadcast.emit("playerJoined", player);
      io.emit("playersUpdated", getPlayers());
    });

    socket.on(
      "playerMove",
      (position: { x: number; y: number; direction: Direction }) => {
        const player = updatePlayerPosition(socket.id, position);

        if (!player) return;

        socket.broadcast.emit("playerMoved", {
          id: player.id,
          x: player.x,
          y: player.y,
          direction: player.direction,
        });
      },
    );

    socket.on("playerAttack", () => {
      const attacker = getPlayerBySocketId(socket.id);

      if (!attacker) return;

      const result = processAttack(attacker);

      if (!result.valid) return;

      io.emit("attackVisual", {
        attackerId: attacker.id,
        x: attacker.x,
        y: attacker.y,
        direction: attacker.direction,
      });

      result.hitTargets.forEach((target) => {
        io.emit("hitVisual", {
          targetId: target.id,
          x: target.x,
          y: target.y,
        });
      });

      result.killedTargets.forEach((target) => {
        io.emit("playerKilled", {
          killerId: attacker.id,
          victimId: target.id,
        });
      });

      io.emit("playersUpdated", getPlayers());
    });

    socket.on("disconnect", () => {
      console.log("Socket desconectado:", socket.id);

      const removedPlayer = removePlayerBySocketId(socket.id);

      if (!removedPlayer) return;

      io.emit("playerLeft", removedPlayer.id);
      io.emit("playersUpdated", getPlayers());
    });
  });
}
