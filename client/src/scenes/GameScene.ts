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

type PlayerUi = {
  sprite: Phaser.GameObjects.Sprite;
  name: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private attackKeyAlt!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;

  private otherPlayers: Record<string, PlayerUi> = {};
  private playerData: Record<string, PlayerData> = {};

  private localPlayerId: string | null = null;
  private roomId: string | null = null;
  private localNameText!: Phaser.GameObjects.Text;
  private localHpBar!: Phaser.GameObjects.Graphics;
  private colliders: Phaser.GameObjects.Rectangle[] = [];
  private playerGlow!: Phaser.GameObjects.Arc;

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
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);

    this.createPlayerTextures();
    this.createAnimations();
    this.createWorld();
    this.createAmbientEffects();
    this.createLocalPlayer();
    this.localCooldownBar = this.add.graphics().setDepth(41);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.attackKeyAlt = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.colliders.forEach((obj) => this.physics.add.collider(this.player, obj));

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
    this.updateLocalPlayerUi();

    if (this.isDying) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moveLeft  = this.cursors.left?.isDown  || mobileInput.left;
    const moveRight = this.cursors.right?.isDown || mobileInput.right;
    const jumpPressed   = this.cursors.up?.isDown || mobileInput.jump;
    const attackPressed = this.attackKey.isDown || this.attackKeyAlt.isDown || mobileInput.attack;

    const isGrounded = body.blocked.down || body.touching.down;
    if (isGrounded) this.lastGroundedTime = time;
    if (jumpPressed && !this.wasJumpPressed) this.lastJumpPressedTime = time;
    this.wasJumpPressed = jumpPressed;

    this.player.setAccelerationX(0);
    if (moveLeft)  { this.currentDirection = 'left';  this.player.setAccelerationX(-this.acceleration); }
    if (moveRight) { this.currentDirection = 'right'; this.player.setAccelerationX(this.acceleration);  }

    const canUseCoyote  = time - this.lastGroundedTime   <= this.coyoteTime;
    const hasBufferedJump = time - this.lastJumpPressedTime <= this.jumpBufferTime;
    if (hasBufferedJump && canUseCoyote) {
      this.player.setVelocityY(this.jumpForce);
      this.lastJumpPressedTime = 0;
      this.lastGroundedTime    = 0;
    }

    if (!jumpPressed && body.velocity.y < -120) this.player.setVelocityY(body.velocity.y * 0.85);

    if (attackPressed && !this.wasAttackPressed && time - this.lastLocalAttackTime >= this.localAttackCooldown) {
      this.showAttackEffect(this.player.x, this.player.y, this.currentDirection);
      socket.emit('playerAttack');
      this.lastLocalAttackTime = time;
    }
    this.wasAttackPressed = attackPressed;

    if (time - this.lastSent > 30) {
      socket.emit('playerMove', { x: this.player.x, y: this.player.y, direction: this.currentDirection });
      this.lastSent = time;
    }

    this.player.setFlipX(this.currentDirection === 'left');
    if (!isGrounded) {
      this.player.play('char-jump', true);
    } else if (Math.abs(body.velocity.x) > 30) {
      this.player.play('char-run', true);
    } else {
      this.player.play('char-idle', true);
    }
  }

  // ── TEXTURES & ANIMATIONS ────────────────────────────────────────────────────

  private createPlayerTextures() {
    const drawKnight = (key: string, opts: {
      leftLegSkew: number; rightLegSkew: number;
      leftLegOffY: number; rightLegOffY: number;
      armY: number; cloakFlare: number; headOffY: number;
    }) => {
      if (this.textures.exists(key)) return;
      const { leftLegSkew, rightLegSkew, leftLegOffY, rightLegOffY, armY, cloakFlare, headOffY } = opts;
      const g = this.add.graphics();

      // Cloak — dark flowing cape, drawn first so body layers over it
      g.fillStyle(0x0b0618, 1);
      g.fillTriangle(24, 24, 14 - cloakFlare, 54, 34 + cloakFlare, 54);
      g.lineStyle(1, 0x1e0d30, 0.85);
      g.lineBetween(24, 24, 14 - cloakFlare, 54);
      g.lineBetween(24, 24, 34 + cloakFlare, 54);

      // Shell / carapace body
      g.fillStyle(0x181828, 1);
      g.fillRect(14, 23, 20, 16);
      g.fillStyle(0x242438, 0.8);
      g.fillRect(15, 24, 18, 6);
      g.lineStyle(1, 0x2a2a40, 0.55);
      g.lineBetween(14, 32, 34, 32);

      // Shoulder pauldrons
      g.fillStyle(0x1a1a2e, 1);
      g.fillRect(10, 23, 5, 8);
      g.fillRect(33, 23, 5, 8);

      // Arms
      g.fillStyle(0x888898, 1);
      g.fillRect(5, armY, 9, 3);
      g.fillRect(34, armY, 9, 3);

      // Nail — bright white sliver held in right hand
      g.fillStyle(0xe0eeff, 1);
      g.fillRect(41, armY - 8, 2, 14);
      g.fillStyle(0xffffff, 0.75);
      g.fillRect(41, armY - 8, 2, 4);

      // Head — pale oval
      g.fillStyle(0xc8d4e2, 1);
      g.fillEllipse(24, 13 + headOffY, 20, 18);
      // Subtle shadow on head
      g.fillStyle(0xa0b0be, 0.35);
      g.fillEllipse(27, 15 + headOffY, 11, 9);

      // Horns / antennae
      g.fillStyle(0x40404e, 1);
      g.fillRect(14, 2 + headOffY, 3, 10);
      g.fillRect(27, 2 + headOffY, 3, 10);
      g.fillStyle(0x606070, 1);
      g.fillRect(14, 2 + headOffY, 3, 3);
      g.fillRect(27, 2 + headOffY, 3, 3);

      // Eyes — glowing cyan
      g.fillStyle(0x5ef0ff, 1);
      g.fillCircle(19, 13 + headOffY, 3);
      g.fillCircle(29, 13 + headOffY, 3);
      // Eye white core
      g.fillStyle(0xdfffff, 0.85);
      g.fillCircle(20, 12 + headOffY, 1.5);
      g.fillCircle(30, 12 + headOffY, 1.5);

      // Legs
      g.fillStyle(0x28283c, 1);
      g.fillRect(15 + leftLegSkew,  39 + leftLegOffY,  6, 12);
      g.fillRect(27 + rightLegSkew, 39 + rightLegOffY, 6, 12);
      // Boots
      g.fillStyle(0x101020, 1);
      g.fillRect(14 + leftLegSkew,  50 + leftLegOffY,  8, 4);
      g.fillRect(26 + rightLegSkew, 50 + rightLegOffY, 8, 4);
      g.fillStyle(0x1e1e30, 0.6);
      g.fillRect(14 + leftLegSkew,  50 + leftLegOffY,  8, 2);
      g.fillRect(26 + rightLegSkew, 50 + rightLegOffY, 8, 2);

      g.generateTexture(key, 48, 56);
      g.destroy();
    };

    drawKnight('char-idle', { leftLegSkew: 0,  rightLegSkew: 0,  leftLegOffY: 0,  rightLegOffY: 0,  armY: 27, cloakFlare: 2, headOffY: 0  });
    drawKnight('char-run1', { leftLegSkew: -3, rightLegSkew: 3,  leftLegOffY: -3, rightLegOffY: 3,  armY: 26, cloakFlare: 5, headOffY: -1 });
    drawKnight('char-run2', { leftLegSkew: 3,  rightLegSkew: -3, leftLegOffY: 3,  rightLegOffY: -3, armY: 28, cloakFlare: 5, headOffY: 1  });
    drawKnight('char-jump', { leftLegSkew: -4, rightLegSkew: 4,  leftLegOffY: -2, rightLegOffY: -2, armY: 21, cloakFlare: 9, headOffY: -2 });
  }

  private createAnimations() {
    if (this.anims.exists('char-idle')) return;
    this.anims.create({ key: 'char-idle', frames: [{ key: 'char-idle' }], frameRate: 1, repeat: -1 });
    this.anims.create({
      key: 'char-run',
      frames: [{ key: 'char-run1' }, { key: 'char-idle' }, { key: 'char-run2' }, { key: 'char-idle' }],
      frameRate: 10, repeat: -1,
    });
    this.anims.create({ key: 'char-jump', frames: [{ key: 'char-jump' }], frameRate: 1, repeat: -1 });
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
    // Stone surface variation
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
      // Capitals
      colG.fillStyle(0x091828, 1);
      colG.fillRect(cx - 29, 16, 58, 22);
      colG.fillRect(cx - 24, 38, 48, 12);
      colG.fillRect(cx - 29, this.worldHeight - 52, 58, 22);
      colG.fillRect(cx - 24, this.worldHeight - 74, 48, 12);
      // Carved horizontal lines
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
    // Ground surface glow
    this.add.rectangle(this.worldWidth / 2, this.worldHeight - 40, this.worldWidth, 2, 0x5ee8ff, 0.18).setDepth(2);
    // Cracks in ground
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
      // Top glow edge
      this.add.rectangle(x, y - 7, w, 2, 0x5ee8ff, 0.58).setDepth(3);
      // Bottom shadow
      this.add.rectangle(x, y + 8, w, 4, 0x020508, 0.78).setDepth(3);
      // Stone segments
      const pg = this.add.graphics().setDepth(3);
      pg.lineStyle(1, 0x152030, 0.48);
      for (let xi = x - w / 2 + 50; xi < x + w / 2; xi += 50) pg.lineBetween(xi, y - 8, xi, y + 8);
      // Rune glow strip
      pg.fillStyle(0x1a4a60, 0.10);
      pg.fillRect(x - w / 2, y - 8, w, 2);
      // Pulsing orb on platform
      const platOrb = this.add.circle(x, y - 10, 3, 0x40d8c0, 0.62).setDepth(4);
      this.tweens.add({
        targets: platOrb, alpha: { from: 0.28, to: 0.72 }, scale: { from: 0.8, to: 1.2 },
        duration: 880 + i * 95, yoyo: true, repeat: -1,
      });
    });

    // === WALL TORCHES ===
    [360, 680, 1100, 1520, 1840].forEach((tx, i) => {
      const ty = this.worldHeight - 60;
      // Sconce bracket
      const bracketG = this.add.graphics().setDepth(4);
      bracketG.fillStyle(0x1c2838, 1);
      bracketG.fillRect(tx - 5, ty - 11, 10, 13);
      bracketG.lineStyle(1, 0x2a3a50, 0.75);
      bracketG.strokeRect(tx - 5, ty - 11, 10, 13);
      // Glow rings
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

    // Drifting soul orbs
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

    // Ground mist wisps
    for (let i = 0; i < 10; i++) {
      const mx = Phaser.Math.Between(0, W);
      const my = H - Phaser.Math.Between(22, 72);
      const mist = this.add.ellipse(mx, my, Phaser.Math.Between(180, 380), 44, 0x1a3a50, 0.05).setDepth(0);
      this.tweens.add({
        targets: mist,
        x: `+=${Phaser.Math.Between(80, 220)}`,
        alpha: { from: 0.02, to: 0.08 },
        duration: Phaser.Math.Between(9000, 17000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // Water drips from stalactites
    const dripXs = [105, 295, 455, 595, 785, 955, 1085, 1235, 1385, 1535, 1675, 1855, 2035];
    dripXs.forEach((dx, i) => {
      const drip = this.add.circle(dx, Phaser.Math.Between(52, 145), 1.5, 0x5ee8ff, 0.52).setDepth(-3);
      this.tweens.add({
        targets: drip,
        y: H - 40,
        alpha: 0,
        duration: Phaser.Math.Between(1600, 3800),
        delay: i * 340 + Phaser.Math.Between(0, 2200),
        repeat: -1,
        repeatDelay: Phaser.Math.Between(2000, 7500),
        onRepeat: () => { drip.setPosition(dx, Phaser.Math.Between(52, 145)).setAlpha(0.52); },
      });
    });

    // Ambient dust motes
    for (let i = 0; i < 14; i++) {
      const dot = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(100, H - 100),
        1, 0xaaccdd, Phaser.Math.FloatBetween(0.03, 0.16),
      ).setDepth(-1);
      this.tweens.add({
        targets: dot,
        x: `+=${Phaser.Math.Between(-90, 90)}`,
        y: `+=${Phaser.Math.Between(-45, 45)}`,
        alpha: { from: 0.03, to: 0.16 },
        duration: Phaser.Math.Between(7000, 14000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // ── LOCAL PLAYER ─────────────────────────────────────────────────────────────

  private createLocalPlayer() {
    this.player = this.physics.add.sprite(1100, 860, 'char-idle');
    this.player
      .setDisplaySize(48, 56).setTint(0x00ff00)
      .setCollideWorldBounds(true).setBounce(0.05)
      .setDragX(this.drag).setMaxVelocity(this.moveSpeed, this.maxFallSpeed)
      .setDepth(6);
    this.player.play('char-idle');
    this.cameras.main.startFollow(this.player, true, 0.10, 0.10);

    // Soul glow halo
    this.playerGlow = this.add.circle(this.player.x, this.player.y, 24, 0x5ee8ff, 0.07).setDepth(5);
    this.tweens.add({
      targets: this.playerGlow,
      alpha: { from: 0.03, to: 0.12 }, scale: { from: 0.88, to: 1.12 },
      duration: 1300, yoyo: true, repeat: -1,
    });

    this.localNameText = this.add.text(this.player.x, this.player.y - 52, getPlayerDisplayName(), {
      fontSize: '12px', color: '#e9feff', backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(40);
    this.localHpBar = this.add.graphics().setDepth(39);
    this.drawHpBar(this.localHpBar, this.player.x, this.player.y - 36, 100);
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
      if (current) Object.assign(current, data);
      const remote = this.otherPlayers[data.id];
      if (remote) {
        remote.sprite.setPosition(data.x, data.y);
        remote.sprite.setFlipX(data.direction === 'left');
        remote.sprite.play('char-run', true);
        this.updateRemoteUi(data.id);
      }
    });

    socket.on('attackVisual', (data: { attackerId: string; x: number; y: number; direction: Direction }) => {
      if (data.attackerId !== this.localPlayerId) this.showAttackEffect(data.x, data.y, data.direction);
    });

    socket.on('hitVisual', (data: { targetId: string; x: number; y: number; knockback?: { x: number; y: number } }) => {
      this.showHitEffect(data.x, data.y);
      if (data.targetId === this.localPlayerId && !this.isDying) {
        if (data.knockback) (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(data.knockback.x, data.knockback.y);
        this.flashPlayerHit();
        this.cameras.main.shake(70, 0.005);
      } else {
        this.flashRemotePlayerHit(data.targetId);
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
      else                            this.timerText.setColor('#dff8ff');
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
        else { this.player.setPosition(player.x, player.y); }
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
      const sprite = this.add.sprite(player.x, player.y, 'char-idle')
        .setDisplaySize(48, 56).setTint(tint).setDepth(5);
      sprite.play('char-idle');
      const name = this.add.text(player.x, player.y - 66, player.name || 'Player', {
        fontSize: '12px', color: '#dff9ff', backgroundColor: 'rgba(1,9,16,0.75)', padding: { x: 6, y: 2 },
      }).setOrigin(0.5).setDepth(40);
      const hpBar = this.add.graphics().setDepth(39);
      this.otherPlayers[player.id] = { sprite, name, hpBar };
    }

    const remote = this.otherPlayers[player.id];
    remote.sprite.setAlpha(1).setPosition(player.x, player.y);
    remote.sprite.setFlipX(player.direction === 'left');
    remote.name.setAlpha(1);
    if (!remote.sprite.anims.isPlaying) remote.sprite.play('char-idle');
    this.updateRemoteUi(player.id);
  }

  private updateRemoteUi(id: string) {
    const player = this.playerData[id];
    const remote = this.otherPlayers[id];
    if (!player || !remote) return;
    remote.name.setText(player.name || 'Player').setPosition(remote.sprite.x, remote.sprite.y - 66);
    this.drawHpBar(remote.hpBar, remote.sprite.x, remote.sprite.y - 50, player.hp ?? 100);
  }

  private updateLocalPlayerUi() {
    this.localNameText.setText(getPlayerDisplayName()).setPosition(this.player.x, this.player.y - 66);
    const hp = this.localPlayerId ? this.playerData[this.localPlayerId]?.hp ?? 100 : 100;
    this.drawHpBar(this.localHpBar, this.player.x, this.player.y - 50, hp);
    this.playerGlow.setPosition(this.player.x, this.player.y);
  }

  private removeRemotePlayer(id: string) {
    const remote = this.otherPlayers[id];
    if (remote) { remote.sprite.destroy(); remote.name.destroy(); remote.hpBar.destroy(); delete this.otherPlayers[id]; }
    delete this.playerData[id];
    this.refreshHud();
  }

  private refreshHud() { updateHud(this.hudText, this.playerData, this.localPlayerId); }

  private cleanupScene() {
    disableGameplayLayout();
    this.scale.off('resize');
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

    // Soul burst on death
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist  = Phaser.Math.Between(28, 76);
      const orb   = this.add.circle(this.player.x, this.player.y, Phaser.Math.Between(3, 7), 0x5ef0ff, 0.9).setDepth(65);
      this.tweens.add({
        targets: orb,
        x: this.player.x + Math.cos(angle) * dist,
        y: this.player.y + Math.sin(angle) * dist - 18,
        alpha: 0, scale: 0.2, duration: 620, ease: 'Power2',
        onComplete: () => orb.destroy(),
      });
    }
    const flash = this.add.circle(this.player.x, this.player.y, 38, 0xffffff, 0.45).setDepth(64);
    this.tweens.add({ targets: flash, alpha: 0, scale: 3, duration: 280, onComplete: () => flash.destroy() });

    this.tweens.add({
      targets: this.player, alpha: 0, duration: 550, ease: 'Power2',
      onComplete: () => {
        this.time.delayedCall(250, () => {
          this.isDying = false;
          this.player.setAlpha(1).setTint(0x00ff00);
          if (this.pendingRespawnPosition) {
            this.player.setPosition(this.pendingRespawnPosition.x, this.pendingRespawnPosition.y);
            this.pendingRespawnPosition = null;
          }
        });
      },
    });
  }

  private handleRemoteDeath(id: string) {
    const remote = this.otherPlayers[id];
    if (!remote) return;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const orb   = this.add.circle(remote.sprite.x, remote.sprite.y, Phaser.Math.Between(2, 5), 0x5ef0ff, 0.7).setDepth(62);
      this.tweens.add({
        targets: orb,
        x: remote.sprite.x + Math.cos(angle) * Phaser.Math.Between(20, 52),
        y: remote.sprite.y + Math.sin(angle) * Phaser.Math.Between(18, 50) - 10,
        alpha: 0, duration: 460, ease: 'Power2',
        onComplete: () => orb.destroy(),
      });
    }
    remote.sprite.setTint(0xff4444);
    this.tweens.add({ targets: [remote.sprite, remote.name], alpha: 0, duration: 400 });
  }

  private flashPlayerHit() {
    this.player.setTint(0xffffff);
    this.time.delayedCall(110, () => { if (!this.isDying) this.player.setTint(0x00ff00); });
  }

  private flashRemotePlayerHit(id: string) {
    const remote = this.otherPlayers[id];
    const data   = this.playerData[id];
    if (!remote || !data) return;
    remote.sprite.setTint(0xffffff);
    this.time.delayedCall(110, () => {
      if (this.otherPlayers[id]) this.otherPlayers[id].sprite.setTint(Number(data.color.replace('#', '0x')));
    });
  }

  private drawCooldownBar(time: number) {
    this.localCooldownBar.clear();
    const ratio = Math.min((time - this.lastLocalAttackTime) / this.localAttackCooldown, 1);
    const bx = this.player.x - 20, by = this.player.y + 32;
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
    // Outer glow
    arc.lineStyle(9, 0x5ef0ff, 0.1);
    arc.beginPath(); arc.arc(cx, y, 40, a0, a1, direction !== 'right'); arc.strokePath();
    // Mid arc
    arc.lineStyle(3, 0x88ffff, 0.72);
    arc.beginPath(); arc.arc(cx, y, 28, a0, a1, direction !== 'right'); arc.strokePath();
    // Crisp inner arc
    arc.lineStyle(2, 0xffffff, 0.94);
    arc.beginPath(); arc.arc(cx, y, 18, a0, a1, direction !== 'right'); arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, scaleX: 1.22, scaleY: 1.22, duration: 148, onComplete: () => arc.destroy() });

    // Slash sparks along the arc
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

    // Nail trail line
    const trail = this.add.graphics().setDepth(49);
    trail.lineStyle(2, 0xffffff, 0.52);
    trail.lineBetween(x + sign * 18, y - 4, cx + sign * 5, y - 7);
    this.tweens.add({ targets: trail, alpha: 0, duration: 95, onComplete: () => trail.destroy() });

    // Impact flash
    const flashCircle = this.add.circle(cx + sign * 8, y, 13, 0xffffff, 0.28).setDepth(52);
    this.tweens.add({ targets: flashCircle, alpha: 0, scale: 1.8, duration: 88, onComplete: () => flashCircle.destroy() });
  }

  // Soul scatter — white flash + cyan shards + floating orbs
  private showHitEffect(x: number, y: number) {
    // Core flash
    const flash = this.add.circle(x, y, 11, 0xffffff, 0.9).setDepth(60);
    this.tweens.add({ targets: flash, alpha: 0, scale: 2.5, duration: 165, onComplete: () => flash.destroy() });

    // Expanding ring
    const ring = this.add.graphics().setDepth(59);
    ring.lineStyle(2, 0x5ef0ff, 0.72);
    ring.strokeCircle(x, y, 9);
    this.tweens.add({ targets: ring, alpha: 0, scale: 3.4, duration: 215, onComplete: () => ring.destroy() });

    // Cyan soul shards
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

    // Floating soul orbs
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 8;
      const orb = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0x5ef0ff, 0.82).setDepth(60);
      this.tweens.add({
        targets: orb,
        x: x + Math.cos(ang) * 32,
        y: y + Math.sin(ang) * 32 - 12,
        alpha: 0, duration: 365, ease: 'Power1', onComplete: () => orb.destroy(),
      });
    }
  }

  private drawHpBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, hp: number) {
    const w = 50, h = 6, fill = Phaser.Math.Clamp(hp, 0, 100) / 100;
    graphics.clear();
    graphics.fillStyle(0x050c13, 0.9).fillRoundedRect(x - w / 2, y, w, h, 3);
    const barColor = fill > 0.5 ? 0x40deaa : fill > 0.25 ? 0xddaa22 : 0xdd3333;
    graphics.fillStyle(barColor, 0.95).fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * fill, h - 2, 2);
    graphics.lineStyle(1, 0x5ee8ff, 0.72).strokeRoundedRect(x - w / 2, y, w, h, 3);
  }
}
