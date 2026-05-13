import { io } from "socket.io-client";

const socketURL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

export const socket = io(socketURL, {
  transports: ["websocket", "polling"],
});
