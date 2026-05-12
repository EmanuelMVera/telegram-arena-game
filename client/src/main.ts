import Phaser from "phaser";
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

type PlayerData = {
  id: string;
  x: number;
  y: number;
  color: string;
};

class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private otherPlayers: Record<string, Phaser.GameObjects.Rectangle> = {};
  private lastSent = 0;

  constructor() {
    super("GameScene");
  }

  preload() {}

  create() {
    this.physics.world.setBounds(0, 0, 900, 500);

    const ground = this.add.rectangle(450, 460, 900, 4, 0xffffff);
    this.physics.add.existing(ground, true);

    this.player = this.physics.add.sprite(100, 300, "");
    this.player.setDisplaySize(40, 40);
    this.player.setTint(0x00ff00);
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.2);

    this.physics.add.collider(this.player, ground);

    this.cursors = this.input.keyboard!.createCursorKeys();

    socket.on("currentPlayers", (players: Record<string, PlayerData>) => {
      Object.values(players).forEach((p) => {
        if (p.id === socket.id) {
          this.player.setPosition(p.x, p.y);
        } else {
          this.addOtherPlayer(p);
        }
      });
    });

    socket.on("playerJoined", (p: PlayerData) => {
      this.addOtherPlayer(p);
    });

    socket.on("playerMoved", (p: PlayerData) => {
      const other = this.otherPlayers[p.id];
      if (other) {
        other.setPosition(p.x, p.y);
      }
    });

    socket.on("playerLeft", (id: string) => {
      this.otherPlayers[id]?.destroy();
      delete this.otherPlayers[id];
    });
  }

  update(time: number) {
    const speed = 220;

    this.player.setVelocityX(0);

    if (this.cursors.left?.isDown) {
      this.player.setVelocityX(-speed);
    }

    if (this.cursors.right?.isDown) {
      this.player.setVelocityX(speed);
    }

    if (this.cursors.up?.isDown && this.player.body?.blocked.down) {
      this.player.setVelocityY(-420);
    }

    if (time - this.lastSent > 30) {
      socket.emit("playerMove", {
        x: this.player.x,
        y: this.player.y,
      });

      this.lastSent = time;
    }
  }

  private addOtherPlayer(p: PlayerData) {
    if (this.otherPlayers[p.id]) return;

    const rect = this.add.rectangle(
      p.x,
      p.y,
      40,
      40,
      Number(p.color.replace("#", "0x")),
    );

    this.otherPlayers[p.id] = rect;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 900,
  height: 500,
  backgroundColor: "#111111",
  parent: "app",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 900, x: 0 },
      debug: false,
    },
  },
  scene: GameScene,
};

new Phaser.Game(config);
