import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

type Player = {
  id: string;
  x: number;
  y: number;
  color: string;
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

io.on("connection", (socket) => {
  console.log("Jugador conectado:", socket.id);

  players[socket.id] = {
    id: socket.id,
    x: 100 + Object.keys(players).length * 80,
    y: 300,
    color: colors[Object.keys(players).length % colors.length],
  };

  socket.emit("currentPlayers", players);
  socket.broadcast.emit("playerJoined", players[socket.id]);

  socket.on("playerMove", (position: { x: number; y: number }) => {
    if (!players[socket.id]) return;

    players[socket.id].x = position.x;
    players[socket.id].y = position.y;

    socket.broadcast.emit("playerMoved", players[socket.id]);
  });

  socket.on("disconnect", () => {
    console.log("Jugador desconectado:", socket.id);

    delete players[socket.id];

    io.emit("playerLeft", socket.id);
  });
});

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
