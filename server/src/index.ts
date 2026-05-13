import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socket/socketHandlers";

const app = express();

const clientURL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: clientURL,
  }),
);

app.get("/", (_req, res) => {
  res.send("Arena Brawler 2D server running");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: clientURL,
    methods: ["GET", "POST"],
  },
});

registerSocketHandlers(io);

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
