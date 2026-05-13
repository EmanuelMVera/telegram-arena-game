import { MAX_HP, PLAYER_COLORS, SPAWN_POINTS } from "../config/constants";
import type { ClientIdentity, Direction, Player } from "../types/player";

const players: Record<string, Player> = {};

export function getPlayers() {
  return players;
}

export function getPlayerById(id: string) {
  return players[id];
}

export function getPlayerBySocketId(socketId: string) {
  return Object.values(players).find((player) => player.socketId === socketId);
}

export function createOrReplacePlayer(
  identity: ClientIdentity,
  socketId: string,
  roomId?: string,
) {
  const existingPlayer = players[identity.id];

  if (existingPlayer) {
    const previousSocketId = existingPlayer.socketId;

    existingPlayer.socketId = socketId;
    existingPlayer.name = identity.name;
    existingPlayer.photoUrl = identity.photoUrl;
    if (roomId) existingPlayer.roomId = roomId;

    return {
      player: existingPlayer,
      previousSocketId,
      isReplacement: true,
    };
  }

  const playerCount = Object.keys(players).length;
  const spawnPoint = SPAWN_POINTS[playerCount % SPAWN_POINTS.length];

  const player: Player = {
    id: identity.id,
    socketId,
    name: identity.name,
    source: identity.source,
    photoUrl: identity.photoUrl,
    x: spawnPoint.x,
    y: spawnPoint.y,
    color: PLAYER_COLORS[playerCount % PLAYER_COLORS.length],
    hp: MAX_HP,
    kills: 0,
    deaths: 0,
    direction: "right",
    lastAttackAt: 0,
    roomId,
  };

  players[player.id] = player;

  return {
    player,
    previousSocketId: null,
    isReplacement: false,
  };
}

export function getRoomPlayers(roomId?: string): Record<string, Player> {
  if (!roomId) return { ...players };
  return Object.fromEntries(Object.entries(players).filter(([, p]) => p.roomId === roomId));
}

export function updatePlayerPosition(
  socketId: string,
  position: { x: number; y: number; direction: Direction },
) {
  const player = getPlayerBySocketId(socketId);

  if (!player) return null;

  player.x = position.x;
  player.y = position.y;
  player.direction = position.direction;

  return player;
}

export function removePlayerBySocketId(socketId: string) {
  const player = getPlayerBySocketId(socketId);

  if (!player) return null;

  delete players[player.id];

  return player;
}

export function getRandomSpawnPoint() {
  const index = Math.floor(Math.random() * SPAWN_POINTS.length);

  return SPAWN_POINTS[index];
}

export function resetPlayerAfterDeath(player: Player) {
  const spawnPoint = getRandomSpawnPoint();

  player.hp = MAX_HP;
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.direction = "right";
}
