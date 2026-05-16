import Phaser from 'phaser';
import { mobileInput } from '../input/mobileInput';
import { socket } from '../network/socket';
import {
  disableGameplayLayout,
  enableGameplayLayout,
  getClientIdentity,
  getPlayerDisplayName,
} from '../telegram/telegram';
import type { Direction, PlayerData } from '../types/player';
import { createHud, updateHud } from '../ui/hud';
import { Player } from '../entities/Player';

export class GameScene extends Phaser.Scene {
  private localPlayer!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private attackKeyAlt!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  private otherPlayers: Record<string, Player> = {};
  private playerData: Record<string, PlayerData> = {};

  private localPlayerId: string | null = null;
  private roomId: string | null = null;
  private colliders: Phaser.GameObjects.Rectangle[] = [];

  private lastSent = 0;
  private currentDirection: Direction = 'right';
  private hasJoinedGame = false;
  private isDying = false;
  private pendingRespawnPosition: { x: number; y: number } | null = null;
  private localCooldownBar!: Phaser.GameObjects.Graphics;

  private wasJumpPressed = false;
  private wasAttackPressed = false;
  private lastGroundedTime = 0;
  private lastJumpPressedTime = 0;
  private lastLocalAttackTime = 0;

  private readonly moveSpeed = 280;
  private readonly acceleration = 1600;
  private readonly drag = 1800;
  private readonly jumpForce = -640;
  private readonly maxFallSpeed = 850;
  private readonly coyoteTime = 100;
  private readonly jumpBufferTime = 100;
  private readonly localAttackCooldown = 500;
  private readonly worldWidth = 2200;
  private readonly worldHeight = 980;

  constructor() { super('GameScene'); }

  create() {
    enableGameplayLayout();
    this.cameras.main.setBackgroundColor('#020508');
    this.localPlayerId = getClientIdentity().id;
    this.roomId = (this.scene.settings.data as { roomId?: string } | null)?.roomId ?? null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY,  this.cleanupScene, this);

    this.createAnimations();
    this.createWorld();
    this.createAmbientEffects();
    this.createLocalPlayer();
    this.localCooldownBar = this.add.graphics().setDepth(41);

    this.cursors    = this.input.keyboard!.createCursorKeys();
    this.attackKey  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.attackKeyAlt = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.colliders.forEach((obj) => this.physics.add.collider(this.localPlayer.sprite, obj));

    this.hudText = createHud(this);
    this.timerText = this.add.text(this.scale.width / 2, 14, '3:00', {
      fontSize: '18px', color: '#dff8ff', fontStyle: 'bold',
      backgroundColor: 'rgba(2,8,17,0.75)', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.timerText?.setX(size.width / 2);
    }, this);

    this.registerSocketEvents();
    this.joinGameOnce();
  }

  update(time: number) {
    this.drawCooldownBar(time);

    const hp = this.localPlayerId ? this.playerData[this.localPlayerId]?.hp ?? 100 : 100;
    this.localPlayer.updateUi(getPlayerDisplayName(), hp);

    if (this.isDying) return;

    const body = this.localPlayer.sprite.body as Phaser.Physics.Arcade.Body;
    const moveLeft  = this.cursors.left?.isDown  || mobileInput.left;
    const moveRight = this.cursors.right?.isDown || mobileInput.right;
    const jumpPressed   = this.cursors.up?.isDown || mobileInput.jump;
    const attackPressed = this.attackKey.isDown || this.attackKeyAlt.isDown || mobileInput.attack;

    const isGrounded = body.blocked.down || body.touching.down;
    if (isGrounded) this.lastGroundedTime = time;
    if (jumpPressed && !this.wasJumpPressed) this.lastJumpPressedTime = time;
    this.wasJumpPressed = jumpPressed;

    this.localPlayer.sprite.setAccelerationX(0);
    if (moveLeft)  { this.currentDirection = 'left';  this.localPlayer.sprite.setAccelerationX(-this.acceleration); }
    if (moveRight) { this.currentDirection = 'right'; this.localPlayer.sprite.setAccelerationX(this.acceleration);  }

    const canUseCoyote    = time - this.lastGroundedTime   <= this.coyoteTime;
    const hasBufferedJump = time - this.lastJumpPressedTime <= this.jumpBufferTime;
    if (hasBufferedJump && canUseCoyote) {
      const jumped = this.localPlayer.startJump(() => {
        body.setVelocityY(this.jumpForce);
      });
      if (jumped) {
        this.lastJumpPressedTime = 0;
        this.lastGroundedTime    = 0;
      }
    }

    if (!jumpPressed && body.velocity.y < -120) {
      this.localPlayer.sprite.setVelocityY(body.velocity.y * 0.85);
    }

    if (attackPressed && !this.wasAttackPressed && time - this.lastLocalAttackTime >= this.localAttackCooldown) {
      const dir = this.currentDirection;
      const attacked = this.localPlayer.playAttack(() => {
        this.showAttackEffect(this.localPlayer.x, this.localPlayer.y, dir);
        socket.emit('playerAttack');
      });
      if (attacked) this.lastLocalAttackTime = time;
    }
    this.wasAttackPressed = attackPressed;

    if (time - this.lastSent > 30) {
      socket.emit('playerMove', { x: this.localPlayer.x, y: this.localPlayer.y, direction: this.currentDirection });
      this.lastSent = time;
    }

    this.localPlayer.setDirection(this.currentDirection);
    this.localPlayer.updateAnimation(isGrounded, body.velocity.x, body.velocity.y);
  }

  // ── ANIMATIONS ───────────────────────────────────────────────────────────────

  private createAnimations() {
    if (this.anims.exists('man-idle')) return;

    // Attack: 7 frames at 14 fps, plays once
    this.anims.create({
      key: 'man-attack',
      frames: this.anims.generateFrameNumbers('man-attack', { start: 0, end: 6 }),
      frameRate: 14, repeat: 0,
    });

    // Jump phases: all from the 11-frame spritesheet
    this.anims.create({
      key: 'man-jump-start',
      frames: this.anims.generateFrameNumbers('man-jump', { start: 0, end: 5 }),
      frameRate: 14, repeat: 0,
    });
    this.anims.create({
      key: 'man-jump-air',
      frames: this.anims.generateFrameNumbers('man-jump', { start: 6, end: 6 }),
      frameRate: 1, repeat: -1,
    });
    this.anims.create({
      key: 'man-jump-preland',
      frames: this.anims.generateFrameNumbers('man-jump', { start: 7, end: 7 }),
      frameRate: 1, repeat: -1,
    });
    this.anims.create({
      key: 'man-jump-land',
      frames: this.anims.generateFrameNumbers('man-jump', { start: 8, end: 10 }),
      frameRate: 12, repeat: 0,
    });

    // Single-frame static images
    const loops: string[] = ['man-idle', 'man-run', 'man-fall'];
    loops.forEach((key) => {
      this.anims.create({ key, frames: [{ key }], frameRate: 1, repeat: -1 });
    });
    const once: string[] = ['man-hurt', 'man-death', 'man-parry'];
    once.forEach((key) => {
      this.anims.create({ key, frames: [{ key }], frameRate: 1, repeat: 0 });
    });
  }

  // ── WORLD ────────────────────────────────────────────────────────────────────

  private createWorld() {
    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    // === DEEP BACKGROUND ===
    this.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x010407).setDepth(-20);

    // Stone wall mortar lines
    const wallG = this.add.graphics().setDepth(-18);
    wallG.lineStyle(1, 0x060c12, 0.9);
    for (let y = 0; y < this.worldHeight; y += 72) wallG.lineBetween(0, y, this.worldWidth, y);
    for (let row = 0; row < Math.ceil(this.worldHeight / 72); row++) {
      const off = (row % 2) * 88;
      for (let x = off; x < this.worldWidth + 88; x += 176) wallG.lineBetween(x, row * 72, x, (row + 1) * 72);
    }
    wallG.fillStyle(0x020609, 0.35);
    [[175,85],[470,275],[850,185],[1270,385],[1650,135],[1975,325],[375,570],[770,470],[1170,625],[1550,675]].forEach(
      ([px, py]) => wallG.fillEllipse(px, py, 135, 68),
    );

    // === FAR RUINS / ARCHES === depth -15
    const ruinG = this.add.graphics().setDepth(-15);
    [270, 710, 1170, 1640, 2010].forEach((ax) => {
      ruinG.fillStyle(0x030810, 0.72);
      ruinG.fillRect(ax - 64, 75, 22, this.worldHeight - 125);
      ruinG.fillRect(ax + 42, 75, 22, this.worldHeight - 125);
      ruinG.fillRect(ax - 64, 75, 128, 26);
      ruinG.fillStyle(0x04101e, 0.42);
      ruinG.fillRect(ax - 42, 101, 84, 220);
      ruinG.lineStyle(1, 0x152030, 0.45);
      ruinG.lineBetween(ax - 56, 118, ax - 56, 205);
      ruinG.lineBetween(ax + 56, 118, ax + 56, 205);
      ruinG.lineBetween(ax - 42, 90, ax + 42, 90);
    });

    // === MID COLUMNS === depth -10
    const colG = this.add.graphics().setDepth(-10);
    [150, 540, 1035, 1525, 2030].forEach((cx) => {
      colG.fillStyle(0x050d1a, 1);
      colG.fillRect(cx - 22, 0, 44, this.worldHeight);
      colG.fillStyle(0x0a1a2c, 0.45);
      colG.fillRect(cx - 22, 0, 6, this.worldHeight);
      colG.fillStyle(0x020507, 0.45);
      colG.fillRect(cx + 16, 0, 6, this.worldHeight);
      colG.fillStyle(0x091828, 1);
      colG.fillRect(cx - 29, 16, 58, 22);
      colG.fillRect(cx - 24, 38, 48, 12);
      colG.fillRect(cx - 29, this.worldHeight - 52, 58, 22);
      colG.fillRect(cx - 24, this.worldHeight - 74, 48, 12);
      colG.lineStyle(1, 0x172838, 0.38);
      for (let ry = 80; ry < this.worldHeight - 80; ry += 90) colG.lineBetween(cx - 20, ry, cx + 20, ry);
    });

    // === HANGING CHAINS === depth -8
    const chainG = this.add.graphics().setDepth(-8);
    [235, 635, 935, 1335, 1735].forEach((cx) => {
      for (let cy = 0; cy < 210; cy += 9) {
        chainG.fillStyle(cy % 18 < 9 ? 0x18263a : 0x111e2c, 0.72);
        chainG.fillRect(cx - 2, cy, 4, 6);
      }
    });

    // === CEILING STALACTITES === depth -6
    const stalG = this.add.graphics().setDepth(-6);
    stalG.fillStyle(0x050c16, 1);
    [
      { x: 105, h: 88 }, { x: 295, h: 65 }, { x: 455, h: 108 }, { x: 595, h: 74 },
      { x: 785, h: 95 }, { x: 955, h: 60 }, { x: 1085, h: 80 }, { x: 1235, h: 100 },
      { x: 1385, h: 70 }, { x: 1535, h: 90 }, { x: 1675, h: 76 }, { x: 1855, h: 64 },
      { x: 2035, h: 96 }, { x: 2135, h: 54 },
    ].forEach(({ x, h }) => {
      stalG.fillTriangle(x - 13, 0, x + 13, 0, x, h);
      stalG.fillStyle(0x1a3a52, 0.32);
      stalG.fillCircle(x, h - 3, 3.5);
      stalG.fillStyle(0x050c16, 1);
    });

    // === FLOOR STALAGMITES (decorative) === depth -4
    const stagG = this.add.graphics().setDepth(-4);
    stagG.fillStyle(0x060e18, 1);
    [
      { x: 72, h: 54 }, { x: 188, h: 40 }, { x: 438, h: 48 }, { x: 865, h: 44 },
      { x: 1338, h: 60 }, { x: 1638, h: 42 }, { x: 1938, h: 52 }, { x: 2108, h: 46 },
    ].forEach(({ x, h }) => {
      stagG.fillTriangle(x - 10, this.worldHeight - 22, x + 10, this.worldHeight - 22, x, this.worldHeight - 22 - h);
      stagG.fillStyle(0x1a3040, 0.28);
      stagG.fillCircle(x, this.worldHeight - 22 - h + 3, 2.5);
      stagG.fillStyle(0x060e18, 1);
    });

    // === GROUND ===
    const ground = this.add.rectangle(this.worldWidth / 2, this.worldHeight - 20, this.worldWidth, 40, 0x070e1a).setDepth(1);
    this.physics.add.existing(ground, true);
    this.colliders.push(ground);
    this.add.rectangle(this.worldWidth / 2, this.worldHeight - 40, this.worldWidth, 2, 0x5ee8ff, 0.18).setDepth(2);
    const crackG = this.add.graphics().setDepth(2);
    [[88,0],[278,3],[558,-2],[838,0],[1118,4],[1398,-3],[1678,2],[1958,0],[2138,3]].forEach(([cx, cy]) => {
      crackG.lineStyle(1, 0x162232, 0.48);
      crackG.lineBetween(cx, this.worldHeight - 40 + cy, cx + 66, this.worldHeight - 32 + cy);
      crackG.lineBetween(cx + 31, this.worldHeight - 40 + cy, cx + 18, this.worldHeight - 30 + cy);
      crackG.lineStyle(1, 0x284858, 0.12);
      crackG.lineBetween(cx, this.worldHeight - 40 + cy, cx + 66, this.worldHeight - 32 + cy);
    });
    const groundG = this.add.graphics().setDepth(2);
    groundG.lineStyle(1, 0x0d1c2c, 0.52);
    for (let x = 0; x < this.worldWidth; x += 160) groundG.lineBetween(x, this.worldHeight - 40, x, this.worldHeight);

    // === PLATFORMS ===
    const platforms = [
      { x: 380,  y: 780, w: 240 }, { x: 1100, y: 780, w: 240 }, { x: 1820, y: 780, w: 240 },
      { x: 700,  y: 640, w: 220 }, { x: 1500, y: 640, w: 220 },
      { x: 1100, y: 500, w: 230 }, { x: 1100, y: 360, w: 210 },
    ];
    platforms.forEach(({ x, y, w }, i) => {
      const plat = this.add.rectangle(x, y, w, 18, 0x09172a).setDepth(2);
      this.physics.add.existing(plat, true);
      this.colliders.push(plat);
      this.add.rectangle(x, y - 7, w, 2, 0x5ee8ff, 0.58).setDepth(3);
      this.add.rectangle(x, y + 8, w, 4, 0x020508, 0.78).setDepth(3);
      const pg = this.add.graphics().setDepth(3);
      pg.lineStyle(1, 0x152030, 0.48);
      for (let xi = x - w / 2 + 50; xi < x + w / 2; xi += 50) pg.lineBetween(xi, y - 8, xi, y + 8);
      pg.fillStyle(0x1a4a60, 0.10);
      pg.fillRect(x - w / 2, y - 8, w, 2);
      const platOrb = this.add.circle(x, y - 10, 3, 0x40d8c0, 0.62).setDepth(4);
      this.tweens.add({
        targets: platOrb, alpha: { from: 0.28, to: 0.72 }, scale: { from: 0.8, to: 1.2 },
        duration: 880 + i * 95, yoyo: true, repeat: -1,
      });
    });

    // === WALL TORCHES ===
    [360, 680, 1100, 1520, 1840].forEach((tx, i) => {
      const ty = this.worldHeight - 60;
      const bracketG = this.add.graphics().setDepth(4);
      bracketG.fillStyle(0x1c2838, 1);
      bracketG.fillRect(tx - 5, ty - 11, 10, 13);
      bracketG.lineStyle(1, 0x2a3a50, 0.75);
      bracketG.strokeRect(tx - 5, ty - 11, 10, 13);
      const glow2 = this.add.circle(tx, ty - 14, 32, 0xff6600, 0.04).setDepth(3);
      const glow1 = this.add.circle(tx, ty - 14, 18, 0xff9933, 0.09).setDepth(3);
      const orb   = this.add.circle(tx, ty - 14, 5,  0xffaa44, 0.95).setDepth(4);
      const core  = this.add.circle(tx, ty - 16, 2,  0xffffff, 0.9).setDepth(5);
      this.tweens.add({
        targets: [orb, core],
        alpha: { from: 0.68, to: 1 }, scaleX: { from: 0.82, to: 1.12 }, scaleY: { from: 0.82, to: 1.18 },
        y: '-=2', duration: 470 + i * 118, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.tweens.add({
        targets: [glow1, glow2], alpha: { from: 0.02, to: 0.1 }, scale: { from: 0.88, to: 1.12 },
        duration: 660 + i * 88, yoyo: true, repeat: -1,
      });
    });
  }

  // ── AMBIENT EFFECTS ──────────────────────────────────────────────────────────

  private createAmbientEffects() {
    const W = this.worldWidth;
    const H = this.worldHeight;

    for (let i = 0; i < 24; i++) {
      const sx = Phaser.Math.Between(80, W - 80);
      const sy = Phaser.Math.Between(H * 0.3, H * 0.88);
      const orb = this.add.circle(sx, sy, Phaser.Math.Between(1, 3), 0x5ee8ff, Phaser.Math.FloatBetween(0.07, 0.32)).setDepth(-2);
      this.tweens.add({
        targets: orb,
        y: `-=${Phaser.Math.Between(160, 460)}`,
        x: `+=${Phaser.Math.Between(-70, 70)}`,
        alpha: 0,
        duration: Phaser.Math.Between(4500, 10500),
        delay: Phaser.Math.Between(0, 6500),
        repeat: -1,
        repeatDelay: Phaser.Math.Between(400, 3500),
        onRepeat: () => {
          orb.setPosition(Phaser.Math.Between(80, W - 80), Phaser.Math.Between(H * 0.5, H * 0.9));
          orb.setAlpha(Phaser.Math.FloatBetween(0.08, 0.32));
        },
      });
    }

    for (let i = 0; i < 10; i++) {
      const mx = Phaser.Math.Between(0, W);
      const my = H - Phaser.Math.Between(22, 72);
      const mist = this.add.ellipse(mx, my, Phaser.Math.Between(180, 380), 44, 0x1a3a50, 0.05).setDepth(0);
      this.tweens.add({
        targets: mist, x: `+=${Phaser.Math.Between(80, 220)}`, alpha: { from: 0.02, to: 0.08 },
        duration: Phaser.Math.Between(9000, 17000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    const dripXs = [105, 295, 455, 595, 785, 955, 1085, 1235, 1385, 1535, 1675, 1855, 2035];
    dripXs.forEach((dx, i) => {
      const drip = this.add.circle(dx, Phaser.Math.Between(52, 145), 1.5, 0x5ee8ff, 0.52).setDepth(-3);
      this.tweens.add({
        targets: drip, y: H - 40, alpha: 0,
        duration: Phaser.Math.Between(1600, 3800),
        delay: i * 340 + Phaser.Math.Between(0, 2200),
        repeat: -1, repeatDelay: Phaser.Math.Between(2000, 7500),
        onRepeat: () => { drip.setPosition(dx, Phaser.Math.Between(52, 145)).setAlpha(0.52); },
      });
    });

    for (let i = 0; i < 14; i++) {
      const dot = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(100, H - 100),
        1, 0xaaccdd, Phaser.Math.FloatBetween(0.03, 0.16),
      ).setDepth(-1);
      this.tweens.add({
        targets: dot,
        x: `+=${Phaser.Math.Between(-90, 90)}`, y: `+=${Phaser.Math.Between(-45, 45)}`,
        alpha: { from: 0.03, to: 0.16 }, duration: Phaser.Math.Between(7000, 14000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // ── LOCAL PLAYER ─────────────────────────────────────────────────────────────

  private createLocalPlayer() {
    this.localPlayer = new Player(this, 1100, 860, {
      isLocal: true,
      name: getPlayerDisplayName(),
      depth: 6,
    });

    // Physics configuration specific to local player
    this.localPlayer.sprite
      .setDragX(this.drag)
      .setMaxVelocity(this.moveSpeed, this.maxFallSpeed);

    this.cameras.main.startFollow(this.localPlayer.sprite, true, 0.10, 0.10);
  }

  private joinGameOnce() {
    if (this.hasJoinedGame) return;
    socket.emit('joinGame', { ...getClientIdentity(), name: getPlayerDisplayName(), roomId: this.roomId });
    this.hasJoinedGame = true;
  }

  // ── SOCKET EVENTS ────────────────────────────────────────────────────────────

  private registerSocketEvents() {
    const events = ['localPlayer','currentPlayers','playerJoined','playerMoved','playersUpdated',
      'attackVisual','hitVisual','playerKilled','duplicateConnection','playerLeft','timerUpdate','gameOver'];
    events.forEach((e) => socket.off(e));

    socket.on('localPlayer', (data: { id: string }) => { this.localPlayerId = data.id; this.removeRemotePlayer(data.id); });
    socket.on('currentPlayers', (players: Record<string, PlayerData>) => this.upsertPlayers(players));
    socket.on('playerJoined', (player: PlayerData) => this.upsertPlayers({ ...this.playerData, [player.id]: player }));
    socket.on('playersUpdated', (players: Record<string, PlayerData>) => this.upsertPlayers(players));

    socket.on('playerMoved', (data: { id: string; x: number; y: number; direction: Direction }) => {
      const current = this.playerData[data.id];
      const isMoving = !current || Math.abs(current.x - data.x) > 1;
      if (current) Object.assign(current, data);
      const remote = this.otherPlayers[data.id];
      if (remote) {
        remote.setPosition(data.x, data.y);
        remote.setDirection(data.direction);
        remote.updateAnimation(true, isMoving ? (data.direction === 'left' ? -100 : 100) : 0, 0);
        remote.updateUi(current?.name ?? 'Player', current?.hp ?? 100);
      }
    });

    socket.on('attackVisual', (data: { attackerId: string; x: number; y: number; direction: Direction }) => {
      if (data.attackerId !== this.localPlayerId) {
        this.showAttackEffect(data.x, data.y, data.direction);
        this.otherPlayers[data.attackerId]?.playAttack();
      }
    });

    socket.on('hitVisual', (data: { targetId: string; x: number; y: number; knockback?: { x: number; y: number } }) => {
      this.showHitEffect(data.x, data.y);
      if (data.targetId === this.localPlayerId && !this.isDying) {
        if (data.knockback) {
          (this.localPlayer.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(data.knockback.x, data.knockback.y);
        }
        this.localPlayer.flashHit();
        this.localPlayer.playHurt();
        this.cameras.main.shake(70, 0.005);
      } else {
        this.otherPlayers[data.targetId]?.flashHit();
        this.otherPlayers[data.targetId]?.playHurt();
      }
    });

    socket.on('playerKilled', (data: { killerId: string; victimId: string }) => {
      this.cameras.main.shake(100, 0.004);
      if (data.victimId === this.localPlayerId) this.handleLocalDeath();
      else this.handleRemoteDeath(data.victimId);
    });

    socket.on('duplicateConnection', () => { alert('Esta cuenta se abrió en otro dispositivo.'); socket.disconnect(); });
    socket.on('playerLeft', (id: string) => this.removeRemotePlayer(id));

    socket.on('timerUpdate', (data: { remaining: number }) => {
      const m = Math.floor(data.remaining / 60);
      const s = data.remaining % 60;
      this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
      if (data.remaining <= 10)      this.timerText.setColor('#ff5555');
      else if (data.remaining <= 30) this.timerText.setColor('#ffaa44');
      else                           this.timerText.setColor('#dff8ff');
    });

    socket.on('gameOver', (data: { ranking: Array<{ id: string; name: string; kills: number; deaths: number }> }) => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('ResultsScene', { ranking: data.ranking }),
      );
    });
  }

  // ── PLAYER STATE ─────────────────────────────────────────────────────────────

  private upsertPlayers(players: Record<string, PlayerData>) {
    this.playerData = players;
    Object.values(players).forEach((player) => {
      if (player.id === this.localPlayerId) {
        if (this.isDying) { this.pendingRespawnPosition = { x: player.x, y: player.y }; }
        else { this.localPlayer.setPosition(player.x, player.y); }
        this.currentDirection = player.direction;
      } else {
        this.addOrUpdateRemotePlayer(player);
      }
    });
    Object.keys(this.otherPlayers).forEach((id) => { if (!players[id]) this.removeRemotePlayer(id); });
    this.refreshHud();
  }

  private addOrUpdateRemotePlayer(player: PlayerData) {
    const tint = Number(player.color.replace('#', '0x'));

    if (!this.otherPlayers[player.id]) {
      this.otherPlayers[player.id] = new Player(this, player.x, player.y, {
        isLocal: false,
        name: player.name ?? 'Player',
        tint,
        depth: 5,
      });
    }

    const p = this.otherPlayers[player.id];
    p.setPosition(player.x, player.y);
    p.setDirection(player.direction);
    p.setAlpha(1);
    p.updateUi(player.name ?? 'Player', player.hp ?? 100);
  }

  private removeRemotePlayer(id: string) {
    this.otherPlayers[id]?.destroy();
    delete this.otherPlayers[id];
    delete this.playerData[id];
    this.refreshHud();
  }

  private refreshHud() { updateHud(this.hudText, this.playerData, this.localPlayerId); }

  private cleanupScene() {
    disableGameplayLayout();
    ['localPlayer','currentPlayers','playerJoined','playerMoved','playersUpdated',
      'attackVisual','hitVisual','playerKilled','duplicateConnection','playerLeft','timerUpdate','gameOver']
      .forEach((e) => socket.off(e));
    this.hasJoinedGame = false;
  }

  // ── COMBAT VISUALS ───────────────────────────────────────────────────────────

  private handleLocalDeath() {
    if (this.isDying) return;
    this.isDying = true;
    this.cameras.main.shake(200, 0.008);
    this.localPlayer.soulBurst(12);
    this.localPlayer.die(() => {
      this.time.delayedCall(250, () => {
        this.isDying = false;
        const pos = this.pendingRespawnPosition ?? { x: 1100, y: 860 };
        this.localPlayer.respawn(pos.x, pos.y);
        this.pendingRespawnPosition = null;
      });
    });
  }

  private handleRemoteDeath(id: string) {
    const p = this.otherPlayers[id];
    if (!p) return;
    p.soulBurst(6);
    this.tweens.add({ targets: p.sprite, alpha: 0, duration: 400 });
  }

  private drawCooldownBar(time: number) {
    this.localCooldownBar.clear();
    const ratio = Math.min((time - this.lastLocalAttackTime) / this.localAttackCooldown, 1);
    const bx = this.localPlayer.x - 20;
    const by = this.localPlayer.y + 36;
    this.localCooldownBar.fillStyle(0x020811, 0.65).fillRect(bx, by, 40, 3);
    if (ratio > 0) this.localCooldownBar.fillStyle(ratio >= 1 ? 0x5ee8ff : 0xff8844, 0.9).fillRect(bx, by, 40 * ratio, 3);
  }

  // Nail swing — three-layer arc + slash sparks + trail
  private showAttackEffect(x: number, y: number, direction: Direction) {
    const sign = direction === 'right' ? 1 : -1;
    const cx   = x + sign * 50;
    const a0   = direction === 'right' ? -0.88 : Math.PI + 0.88;
    const a1   = direction === 'right' ?  0.88 : Math.PI - 0.88;

    const arc = this.add.graphics().setDepth(50);
    arc.lineStyle(9, 0x5ef0ff, 0.1);
    arc.beginPath(); arc.arc(cx, y, 40, a0, a1, direction !== 'right'); arc.strokePath();
    arc.lineStyle(3, 0x88ffff, 0.72);
    arc.beginPath(); arc.arc(cx, y, 28, a0, a1, direction !== 'right'); arc.strokePath();
    arc.lineStyle(2, 0xffffff, 0.94);
    arc.beginPath(); arc.arc(cx, y, 18, a0, a1, direction !== 'right'); arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, scaleX: 1.22, scaleY: 1.22, duration: 148, onComplete: () => arc.destroy() });

    for (let i = 0; i < 5; i++) {
      const frac = i / 4;
      const ang  = a0 + (a1 - a0) * frac;
      const px   = cx + Math.cos(ang) * 28;
      const py   = y  + Math.sin(ang) * 28;
      const sp   = this.add.graphics().setDepth(51);
      sp.lineStyle(1.5, 0xaafeff, 0.88);
      sp.lineBetween(px, py, px + Math.cos(ang) * 10 * sign, py + Math.sin(ang) * 7);
      this.tweens.add({
        targets: sp, alpha: 0,
        x: `+=${Math.cos(ang) * 16 * sign}`, y: `+=${Math.sin(ang) * 9}`,
        duration: 118, onComplete: () => sp.destroy(),
      });
    }

    const trail = this.add.graphics().setDepth(49);
    trail.lineStyle(2, 0xffffff, 0.52);
    trail.lineBetween(x + sign * 18, y - 4, cx + sign * 5, y - 7);
    this.tweens.add({ targets: trail, alpha: 0, duration: 95, onComplete: () => trail.destroy() });

    const flashCircle = this.add.circle(cx + sign * 8, y, 13, 0xffffff, 0.28).setDepth(52);
    this.tweens.add({ targets: flashCircle, alpha: 0, scale: 1.8, duration: 88, onComplete: () => flashCircle.destroy() });
  }

  // Soul scatter — white flash + cyan shards + floating orbs
  private showHitEffect(x: number, y: number) {
    const flash = this.add.circle(x, y, 11, 0xffffff, 0.9).setDepth(60);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.5, duration: 165, onComplete: () => flash.destroy() });

    const ring = this.add.graphics().setDepth(59);
    ring.lineStyle(2, 0x5ef0ff, 0.72);
    ring.strokeCircle(x, y, 9);
    this.tweens.add({ targets: ring, alpha: 0, scale: 3.4, duration: 215, onComplete: () => ring.destroy() });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const shard = this.add.graphics().setDepth(61);
      shard.fillStyle(0x5ef0ff, 0.88);
      shard.fillRect(-2, -5, 4, 10);
      shard.setPosition(x, y).setRotation(angle);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * Phaser.Math.Between(22, 50),
        y: y + Math.sin(angle) * Phaser.Math.Between(22, 50),
        alpha: 0, scale: 0.3,
        rotation: angle + Phaser.Math.FloatBetween(-1.2, 1.2),
        duration: 245, ease: 'Power2', onComplete: () => shard.destroy(),
      });
    }

    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 8;
      const orb = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0x5ef0ff, 0.82).setDepth(60);
      this.tweens.add({
        targets: orb, x: x + Math.cos(ang) * 32, y: y + Math.sin(ang) * 32 - 12,
        alpha: 0, duration: 365, ease: 'Power1', onComplete: () => orb.destroy(),
      });
    }
  }
}
