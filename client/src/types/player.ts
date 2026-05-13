export type Direction = "left" | "right";

export type PlayerData = {
  id: string;
  socketId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  hp: number;
  kills: number;
  deaths: number;
  direction: Direction;
};

export type ClientIdentity = {
  id: string;
  name: string;
  source: "telegram" | "guest";
  photoUrl?: string;
};
