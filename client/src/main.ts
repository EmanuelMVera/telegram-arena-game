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
  attack: false,
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
bindMobileButton("btn-attack", "attack");

const socketURL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
const socket = io(socketURL);

type Direction = "left" | "right";

type PlayerData = {
  id: string;
  x: number;
  y: number;
  color: string;
  hp: number;
  kills: number;
  deaths: number;
  direction: Direction;
};

class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private attackKeyAlt!: Phaser.Input.Keyboard.Key;

  private otherPlayers: Record<string, Phaser.GameObjects.Rectangle> = {};
  private otherPlayerLabels: Record<string, Phaser.GameObjects.Text> = {};

  private playerData: Record<string, PlayerData> = {};
  private hudText!: Phaser.GameObjects.Text;

  private lastSent = 0;
  private currentDirection: Direction = "right";

  private wasJumpPressed = false;
  private wasAttackPressed = false;

  private lastGroundedTime = 0;
  private lastJumpPressedTime = 0;
  private lastLocalAttackTime = 0;

  private readonly moveSpeed = 280;
  private readonly acceleration = 1600;
  private readonly drag = 1800;
  private readonly jumpForce = -500;
  private readonly maxFallSpeed = 850;
  private readonly coyoteTime = 100;
  private readonly jumpBufferTime = 100;
  private readonly localAttackCooldown = 500;

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

    this.attackKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    this.attackKeyAlt = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.J,
    );

    this.hudText = this.add.text(12, 12, "", {
      fontSize: "14px",
      color: "#ffffff",
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      padding: {
        x: 8,
        y: 6,
      },
    });

    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(100);

    socket.on("currentPlayers", (players: Record<string, PlayerData>) => {
      this.playerData = players;

      Object.values(players).forEach((p) => {
        if (p.id === socket.id) {
          this.player.setPosition(p.x, p.y);
          this.currentDirection = p.direction;
        } else {
          this.addOtherPlayer(p);
        }
      });

      this.updateHud();
    });

    socket.on("playerJoined", (p: PlayerData) => {
      this.playerData[p.id] = p;
      this.addOtherPlayer(p);
      this.updateHud();
    });

    socket.on(
      "playerMoved",
      (p: { id: string; x: number; y: number; direction: Direction }) => {
        const current = this.playerData[p.id];

        if (current) {
          current.x = p.x;
          current.y = p.y;
          current.direction = p.direction;
        }

        const other = this.otherPlayers[p.id];

        if (other) {
          other.setPosition(p.x, p.y);
          this.updateOtherPlayerLabel(p.id);
        }
      },
    );

    socket.on("playersUpdated", (players: Record<string, PlayerData>) => {
      this.playerData = players;

      Object.values(players).forEach((p) => {
        if (p.id === socket.id) {
          this.player.setPosition(p.x, p.y);
          this.currentDirection = p.direction;
        } else {
          this.addOtherPlayer(p);

          const other = this.otherPlayers[p.id];

          if (other) {
            other.setPosition(p.x, p.y);
            this.updateOtherPlayerLabel(p.id);
          }
        }
      });

      this.updateHud();
    });

    socket.on(
      "attackVisual",
      (data: {
        attackerId: string;
        x: number;
        y: number;
        direction: Direction;
      }) => {
        this.showAttackEffect(data.x, data.y, data.direction);
      },
    );

    socket.on(
      "hitVisual",
      (data: { targetId: string; x: number; y: number }) => {
        this.showHitEffect(data.x, data.y);
      },
    );

    socket.on("playerKilled", () => {
      this.cameras.main.shake(120, 0.004);
    });

    socket.on("playerLeft", (id: string) => {
      this.otherPlayers[id]?.destroy();
      this.otherPlayerLabels[id]?.destroy();

      delete this.otherPlayers[id];
      delete this.otherPlayerLabels[id];
      delete this.playerData[id];

      this.updateHud();
    });
  }

  update(time: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    const moveLeft = this.cursors.left?.isDown || mobileInput.left;
    const moveRight = this.cursors.right?.isDown || mobileInput.right;
    const jumpPressed = this.cursors.up?.isDown || mobileInput.jump;

    const attackPressed =
      this.attackKey.isDown || this.attackKeyAlt.isDown || mobileInput.attack;

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
      this.currentDirection = "left";
      this.player.setAccelerationX(-this.acceleration);
    }

    if (moveRight) {
      this.currentDirection = "right";
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

    if (
      attackPressed &&
      !this.wasAttackPressed &&
      time - this.lastLocalAttackTime >= this.localAttackCooldown
    ) {
      socket.emit("playerAttack");

      this.lastLocalAttackTime = time;
    }

    this.wasAttackPressed = attackPressed;

    if (time - this.lastSent > 30) {
      socket.emit("playerMove", {
        x: this.player.x,
        y: this.player.y,
        direction: this.currentDirection,
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

    const label = this.add.text(p.x - 32, p.y - 42, "", {
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      padding: {
        x: 4,
        y: 2,
      },
    });

    this.otherPlayers[p.id] = rect;
    this.otherPlayerLabels[p.id] = label;

    this.updateOtherPlayerLabel(p.id);
  }

  private updateOtherPlayerLabel(id: string) {
    const player = this.playerData[id];
    const rect = this.otherPlayers[id];
    const label = this.otherPlayerLabels[id];

    if (!player || !rect || !label) return;

    label.setPosition(rect.x - 34, rect.y - 44);
    label.setText(`HP ${player.hp} | K ${player.kills} D ${player.deaths}`);
  }

  private updateHud() {
    const players = Object.values(this.playerData);

    if (players.length === 0) {
      this.hudText.setText("");
      return;
    }

    const lines = players.map((p, index) => {
      const isMe = p.id === socket.id;
      const name = isMe ? `P${index + 1} (Tú)` : `P${index + 1}`;

      return `${name}  HP:${p.hp}  K:${p.kills}  D:${p.deaths}`;
    });

    this.hudText.setText(lines.join("\n"));
  }

  private showAttackEffect(x: number, y: number, direction: Direction) {
    const offsetX = direction === "right" ? 52 : -52;

    const attackBox = this.add.rectangle(
      x + offsetX,
      y,
      60,
      42,
      0x00ffff,
      0.35,
    );

    attackBox.setStrokeStyle(2, 0x99ffff);
    attackBox.setDepth(50);

    this.tweens.add({
      targets: attackBox,
      alpha: 0,
      duration: 120,
      onComplete: () => {
        attackBox.destroy();
      },
    });
  }

  private showHitEffect(x: number, y: number) {
    const hit = this.add.circle(x, y, 18, 0xffffff, 0.75);

    hit.setDepth(60);

    this.tweens.add({
      targets: hit,
      alpha: 0,
      scale: 2,
      duration: 160,
      onComplete: () => {
        hit.destroy();
      },
    });
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
