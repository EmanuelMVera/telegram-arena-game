import Phaser from "phaser";
import { io } from "socket.io-client";
import "./style.css";

const tg = window.Telegram?.WebApp;

tg?.ready();
tg?.expand();

try {
  tg?.requestFullscreen?.();
} catch {
  console.log("Fullscreen no disponible en esta plataforma");
}

const platform = tg?.platform;

const isTelegramMobile = platform === "android" || platform === "ios";

if (isTelegramMobile) {
  document.body.classList.add("telegram-mobile");
}

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

function updateOrientationMode() {
  if (!isTelegramMobile) return;

  if (isPortrait()) {
    document.body.classList.add("portrait-mode");
  } else {
    document.body.classList.remove("portrait-mode");
  }
}

window.addEventListener("resize", updateOrientationMode);
window.addEventListener("orientationchange", updateOrientationMode);

updateOrientationMode();

const mobileInput = {
  left: false,
  right: false,
  jump: false,
};

function bindMobileButton(id: string, key: keyof typeof mobileInput) {
  const button = document.getElementById(id);

  if (!button) return;

  const press = (event: Event) => {
    event.preventDefault();
    mobileInput[key] = true;
  };

  const release = (event: Event) => {
    event.preventDefault();
    mobileInput[key] = false;
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
}

bindMobileButton("btn-left", "left");
bindMobileButton("btn-right", "right");
bindMobileButton("btn-jump", "jump");

const socketURL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
const socket = io(socketURL);

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

  private wasJumpPressed = false;
  private lastGroundedTime = 0;
  private lastJumpPressedTime = 0;

  private readonly moveSpeed = 280;
  private readonly acceleration = 1600;
  private readonly drag = 1800;
  private readonly jumpForce = -500;
  private readonly maxFallSpeed = 850;
  private readonly coyoteTime = 100;
  private readonly jumpBufferTime = 100;

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

    this.player.setBounce(0.05);
    this.player.setDragX(this.drag);
    this.player.setMaxVelocity(this.moveSpeed, this.maxFallSpeed);

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
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    const moveLeft = this.cursors.left?.isDown || mobileInput.left;
    const moveRight = this.cursors.right?.isDown || mobileInput.right;
    const jumpPressed = this.cursors.up?.isDown || mobileInput.jump;

    const isGrounded = body.blocked.down || body.touching.down;

    if (isGrounded) {
      this.lastGroundedTime = time;
    }

    if (jumpPressed && !this.wasJumpPressed) {
      this.lastJumpPressedTime = time;
    }

    this.wasJumpPressed = jumpPressed;

    this.player.setAccelerationX(0);

    if (moveLeft) {
      this.player.setAccelerationX(-this.acceleration);
    }

    if (moveRight) {
      this.player.setAccelerationX(this.acceleration);
    }

    const canUseCoyoteTime = time - this.lastGroundedTime <= this.coyoteTime;
    const hasBufferedJump =
      time - this.lastJumpPressedTime <= this.jumpBufferTime;

    if (hasBufferedJump && canUseCoyoteTime) {
      this.player.setVelocityY(this.jumpForce);

      this.lastJumpPressedTime = 0;
      this.lastGroundedTime = 0;
    }

    if (!jumpPressed && body.velocity.y < -120) {
      this.player.setVelocityY(body.velocity.y * 0.85);
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
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 1200, x: 0 },
      debug: false,
    },
  },
  scene: GameScene,
};

new Phaser.Game(config);
