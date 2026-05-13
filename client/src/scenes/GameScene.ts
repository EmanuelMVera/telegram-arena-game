import Phaser from "phaser";
import { mobileInput } from "../input/mobileInput";
import { socket } from "../network/socket";
import { getClientIdentity } from "../telegram/telegram";
import type { Direction, PlayerData } from "../types/player";
import { createHud, updateHud } from "../ui/hud";

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private attackKeyAlt!: Phaser.Input.Keyboard.Key;

  private otherPlayers: Record<string, Phaser.GameObjects.Rectangle> = {};
  private otherPlayerLabels: Record<string, Phaser.GameObjects.Text> = {};

  private playerData: Record<string, PlayerData> = {};
  private hudText!: Phaser.GameObjects.Text;

  private localPlayerId: string | null = null;
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
    this.createPlayerTexture();

    this.physics.world.setBounds(0, 0, 900, 500);

    const ground = this.add.rectangle(450, 460, 900, 4, 0xffffff);
    this.physics.add.existing(ground, true);

    this.player = this.physics.add.sprite(100, 300, "player-square");
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

    this.hudText = createHud(this);

    this.registerSocketEvents();

    socket.emit("joinGame", getClientIdentity());
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
      this.showAttackEffect(
        this.player.x,
        this.player.y,
        this.currentDirection,
      );
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

  private registerSocketEvents() {
    socket.on("localPlayer", (data: { id: string }) => {
      this.localPlayerId = data.id;
    });

    socket.on("currentPlayers", (players: Record<string, PlayerData>) => {
      this.playerData = players;

      Object.values(players).forEach((player) => {
        if (player.id === this.localPlayerId) {
          this.player.setPosition(player.x, player.y);
          this.currentDirection = player.direction;
        } else {
          this.addOtherPlayer(player);
        }
      });

      this.refreshHud();
    });

    socket.on("playerJoined", (player: PlayerData) => {
      this.playerData[player.id] = player;

      if (player.id !== this.localPlayerId) {
        this.addOtherPlayer(player);
      }

      this.refreshHud();
    });

    socket.on(
      "playerMoved",
      (player: { id: string; x: number; y: number; direction: Direction }) => {
        const currentPlayer = this.playerData[player.id];

        if (currentPlayer) {
          currentPlayer.x = player.x;
          currentPlayer.y = player.y;
          currentPlayer.direction = player.direction;
        }

        const other = this.otherPlayers[player.id];

        if (other) {
          other.setPosition(player.x, player.y);
          this.updateOtherPlayerLabel(player.id);
        }
      },
    );

    socket.on("playersUpdated", (players: Record<string, PlayerData>) => {
      this.playerData = players;

      this.removeDisconnectedRemotePlayers(players);

      Object.values(players).forEach((player) => {
        if (player.id === this.localPlayerId) {
          this.player.setPosition(player.x, player.y);
          this.currentDirection = player.direction;
        } else {
          this.addOtherPlayer(player);

          const other = this.otherPlayers[player.id];

          if (other) {
            other.setPosition(player.x, player.y);
            this.updateOtherPlayerLabel(player.id);
          }
        }
      });

      this.refreshHud();
    });

    socket.on(
      "attackVisual",
      (data: {
        attackerId: string;
        x: number;
        y: number;
        direction: Direction;
      }) => {
        if (data.attackerId === this.localPlayerId) return;

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

    socket.on("duplicateConnection", () => {
      alert("Esta cuenta se abrió en otro dispositivo.");
      socket.disconnect();
    });

    socket.on("playerLeft", (id: string) => {
      this.otherPlayers[id]?.destroy();
      this.otherPlayerLabels[id]?.destroy();

      delete this.otherPlayers[id];
      delete this.otherPlayerLabels[id];
      delete this.playerData[id];

      this.refreshHud();
    });
  }

  private addOtherPlayer(player: PlayerData) {
    if (this.otherPlayers[player.id]) return;

    const rect = this.add.rectangle(
      player.x,
      player.y,
      40,
      40,
      Number(player.color.replace("#", "0x")),
    );

    const label = this.add.text(player.x - 34, player.y - 44, "", {
      fontSize: "11px",
      color: "#ffffff",
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      padding: {
        x: 4,
        y: 2,
      },
    });

    this.otherPlayers[player.id] = rect;
    this.otherPlayerLabels[player.id] = label;

    this.updateOtherPlayerLabel(player.id);
  }

  private updateOtherPlayerLabel(id: string) {
    const player = this.playerData[id];
    const rect = this.otherPlayers[id];
    const label = this.otherPlayerLabels[id];

    if (!player || !rect || !label) return;

    label.setPosition(rect.x - 34, rect.y - 44);
    label.setText(
      `${player.name} | HP ${player.hp ?? 100} | K ${player.kills ?? 0} D ${
        player.deaths ?? 0
      }`,
    );
  }

  private removeDisconnectedRemotePlayers(players: Record<string, PlayerData>) {
    Object.keys(this.otherPlayers).forEach((id) => {
      if (players[id]) return;

      this.otherPlayers[id].destroy();
      this.otherPlayerLabels[id]?.destroy();

      delete this.otherPlayers[id];
      delete this.otherPlayerLabels[id];
    });
  }

  private refreshHud() {
    updateHud(this.hudText, this.playerData, this.localPlayerId);
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

  private createPlayerTexture() {
    if (this.textures.exists("player-square")) return;

    const graphics = this.add.graphics();

    graphics.lineStyle(3, 0xffffff);
    graphics.strokeRect(0, 0, 40, 40);
    graphics.lineBetween(0, 0, 40, 40);
    graphics.generateTexture("player-square", 40, 40);
    graphics.destroy();
  }
}
