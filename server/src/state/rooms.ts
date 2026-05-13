export type ParticipantInfo = {
  socketId: string;
  playerId: string;
  name: string;
  ready: boolean;
};

export type ParticipantData = {
  name: string;
  ready: boolean;
  isHost: boolean;
};

type Room = {
  id: string;
  hostSocketId: string;
  participants: Record<string, ParticipantInfo>;
  status: "waiting" | "playing";
};

const rooms: Record<string, Room> = {};

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function createRoom(hostSocketId: string, hostId: string, hostName: string): Room {
  const id = generateRoomId();
  const room: Room = {
    id,
    hostSocketId,
    participants: {
      [hostId]: { socketId: hostSocketId, playerId: hostId, name: hostName, ready: false },
    },
    status: "waiting",
  };
  rooms[id] = room;
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms[roomId];
}

export function getRoomBySocketId(socketId: string): Room | undefined {
  return Object.values(rooms).find((r) =>
    Object.values(r.participants).some((p) => p.socketId === socketId),
  );
}

export function addParticipant(
  roomId: string,
  socketId: string,
  playerId: string,
  name: string,
): "ok" | "notFound" | "full" | "started" {
  const room = rooms[roomId];
  if (!room) return "notFound";
  if (room.status !== "waiting") return "started";
  if (room.participants[playerId]) {
    room.participants[playerId].socketId = socketId;
    return "ok";
  }
  if (Object.keys(room.participants).length >= 4) return "full";
  room.participants[playerId] = { socketId, playerId, name, ready: false };
  return "ok";
}

export function removeParticipantBySocketId(socketId: string): {
  room: Room;
  playerId: string;
  wasHost: boolean;
} | null {
  for (const room of Object.values(rooms)) {
    const p = Object.values(room.participants).find((p) => p.socketId === socketId);
    if (!p) continue;
    const wasHost = room.hostSocketId === socketId;
    delete room.participants[p.playerId];
    if (Object.keys(room.participants).length === 0) delete rooms[room.id];
    return { room, playerId: p.playerId, wasHost };
  }
  return null;
}

export function removeParticipantById(
  roomId: string,
  playerId: string,
): { wasHost: boolean } | null {
  const room = rooms[roomId];
  if (!room || !room.participants[playerId]) return null;
  const wasHost = room.participants[playerId].socketId === room.hostSocketId;
  delete room.participants[playerId];
  if (Object.keys(room.participants).length === 0) delete rooms[roomId];
  return { wasHost };
}

export function setParticipantReady(roomId: string, playerId: string): boolean {
  const room = rooms[roomId];
  if (!room || !room.participants[playerId]) return false;
  room.participants[playerId].ready = !room.participants[playerId].ready;
  return true;
}

export function canStartGame(room: Room): boolean {
  const parts = Object.values(room.participants);
  return parts.length >= 1 && parts.every((p) => p.ready);
}

export function startRoom(roomId: string): void {
  if (rooms[roomId]) rooms[roomId].status = "playing";
}

export function deleteRoom(roomId: string): void {
  delete rooms[roomId];
}

export function getParticipantsMap(room: Room): Record<string, ParticipantData> {
  return Object.fromEntries(
    Object.values(room.participants).map((p) => [
      p.playerId,
      { name: p.name, ready: p.ready, isHost: p.socketId === room.hostSocketId },
    ]),
  );
}
