export type Direction = "left" | "right";

export type ClientIdentity = {
  id: string;
  name: string;
  source: "telegram" | "guest";
  photoUrl?: string;
};

export type Player = {
  id: string;
  socketId: string;
  name: string;
  source: "telegram" | "guest";
  photoUrl?: string;
  x: number;
  y: number;
  color: string;
  hp: number;
  kills: number;
  deaths: number;
  direction: Direction;
  lastAttackAt: number;
};
