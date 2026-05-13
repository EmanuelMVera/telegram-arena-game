import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

type Direction = "left" | "right";

type Player = {
  id: string;
  x: number;
  y: number;
  color: string;
  hp: number;
  kills: number;
  deaths: number;
  direction: Direction;
  lastAttackAt: number;
};

const app = express();

const clientURL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: clientURL,
  }),
);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: clientURL,
    methods: ["GET", "POST"],
  },
});

const players: Record<string, Player> = {};

const colors = ["#ff5555", "#55ff55", "#5555ff", "#ffff55"];

const MAX_HP = 100;
const ATTACK_DAMAGE = 20;
const ATTACK_RANGE = 65;
const ATTACK_HEIGHT = 55;
const ATTACK_COOLDOWN = 500;

const spawnPoints = [
  { x: 100, y: 300 },
  { x: 250, y: 300 },
  { x: 650, y: 300 },
  { x: 800, y: 300 },
];

function getSpawnPoint() {
  const index = Math.floor(Math.random() * spawnPoints.length);
  return spawnPoints[index];
}

function getPublicPlayers() {
  return players;
}

io.on("connection", (socket) => {
  console.log("Jugador conectado:", socket.id);

  const playerCount = Object.keys(players).length;
  const spawnPoint = spawnPoints[playerCount % spawnPoints.length];

  players[socket.id] = {
    id: socket.id,
    x: spawnPoint.x,
    y: spawnPoint.y,
    color: colors[playerCount % colors.length],
    hp: MAX_HP,
    kills: 0,
    deaths: 0,
    direction: "right",
    lastAttackAt: 0,
  };

  socket.emit("currentPlayers", getPublicPlayers());
  socket.broadcast.emit("playerJoined", players[socket.id]);
  io.emit("playersUpdated", getPublicPlayers());

  socket.on(
    "playerMove",
    (position: { x: number; y: number; direction: Direction }) => {
      const player = players[socket.id];

      if (!player) return;

      player.x = position.x;
      player.y = position.y;
      player.direction = position.direction;

      socket.broadcast.emit("playerMoved", {
        id: player.id,
        x: player.x,
        y: player.y,
        direction: player.direction,
      });
    },
  );

  socket.on("playerAttack", () => {
    const attacker = players[socket.id];

    if (!attacker) return;

    const now = Date.now();

    if (now - attacker.lastAttackAt < ATTACK_COOLDOWN) {
      return;
    }

    attacker.lastAttackAt = now;

    io.emit("attackVisual", {
      attackerId: attacker.id,
      x: attacker.x,
      y: attacker.y,
      direction: attacker.direction,
    });

    Object.values(players).forEach((target) => {
      if (target.id === attacker.id) return;
      if (target.hp <= 0) return;

      const horizontalDistance =
        attacker.direction === "right"
          ? target.x - attacker.x
          : attacker.x - target.x;

      const verticalDistance = Math.abs(target.y - attacker.y);

      const isInFront = horizontalDistance > 0;
      const isInRange = horizontalDistance <= ATTACK_RANGE;
      const isSameHeight = verticalDistance <= ATTACK_HEIGHT;

      if (!isInFront || !isInRange || !isSameHeight) {
        return;
      }

      target.hp -= ATTACK_DAMAGE;

      io.emit("hitVisual", {
        targetId: target.id,
        x: target.x,
        y: target.y,
      });

      if (target.hp <= 0) {
        attacker.kills += 1;
        target.deaths += 1;

        const respawnPoint = getSpawnPoint();

        target.hp = MAX_HP;
        target.x = respawnPoint.x;
        target.y = respawnPoint.y;
        target.direction = "right";

        io.emit("playerKilled", {
          killerId: attacker.id,
          victimId: target.id,
        });
      }
    });

    io.emit("playersUpdated", getPublicPlayers());
  });

  socket.on("disconnect", () => {
    console.log("Jugador desconectado:", socket.id);

    delete players[socket.id];

    io.emit("playerLeft", socket.id);
    io.emit("playersUpdated", getPublicPlayers());
  });
});

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
