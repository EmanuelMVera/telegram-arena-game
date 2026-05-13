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
    this.cameras.main.setBackgroundColor('#050c14');
    this.localPlayerId = getClientIdentity().id;
    this.roomId = (this.scene.settings.data as { roomId?: string } | null)?.roomId ?? null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);

    this.createPlayerTextures();
    this.createAnimations();
    this.createWorld();
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

    this.registerSocketEvents();
    this.joinGameOnce();
  }

  update(time: number) {
    this.drawCooldownBar(time);
    this.updateLocalPlayerUi();

    if (this.isDying) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const moveLeft = this.cursors.left?.isDown || mobileInput.left;
    const moveRight = this.cursors.right?.isDown || mobileInput.right;
    const jumpPressed = this.cursors.up?.isDown || mobileInput.jump;
    const attackPressed = this.attackKey.isDown || this.attackKeyAlt.isDown || mobileInput.attack;

    const isGrounded = body.blocked.down || body.touching.down;
    if (isGrounded) this.lastGroundedTime = time;
    if (jumpPressed && !this.wasJumpPressed) this.lastJumpPressedTime = time;
    this.wasJumpPressed = jumpPressed;

    this.player.setAccelerationX(0);
    if (moveLeft) { this.currentDirection = 'left'; this.player.setAccelerationX(-this.acceleration); }
    if (moveRight) { this.currentDirection = 'right'; this.player.setAccelerationX(this.acceleration); }

    const canUseCoyote = time - this.lastGroundedTime <= this.coyoteTime;
    const hasBufferedJump = time - this.lastJumpPressedTime <= this.jumpBufferTime;
    if (hasBufferedJump && canUseCoyote) {
      this.player.setVelocityY(this.jumpForce);
      this.lastJumpPressedTime = 0;
      this.lastGroundedTime = 0;
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

    // Animate local player based on movement state
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
    const makeFrame = (
      key: string,
      legLX: number, legLY: number,
      legRX: number, legRY: number,
      armY: number, legH: number,
    ) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1); g.fillCircle(20, 8, 6);          // head
      g.fillStyle(0xbbbbee, 1); g.fillRect(14, 15, 12, 11);      // body
      g.fillStyle(0xddddff, 1);
      g.fillRect(8, armY, 6, 3); g.fillRect(26, armY, 6, 3);    // arms
      g.fillStyle(0x9999cc, 1);
      g.fillRect(legLX, legLY, 5, legH);                         // left leg
      g.fillRect(legRX, legRY, 5, legH);                         // right leg
      g.fillStyle(0x666688, 1);
      g.fillRect(legLX - 1, legLY + legH - 1, 7, 3);             // left boot
      g.fillRect(legRX - 1, legRY + legH - 1, 7, 3);             // right boot
      g.fillStyle(0x222248, 1);
      g.fillRect(16, 6, 2, 2); g.fillRect(22, 6, 2, 2);          // eyes
      g.generateTexture(key, 40, 40);
      g.destroy();
    };

    makeFrame('char-idle', 14, 27, 21, 27, 17, 12);
    makeFrame('char-run1', 11, 25, 24, 28, 17, 12);
    makeFrame('char-run2', 24, 25, 11, 28, 17, 12);
    makeFrame('char-jump', 13, 26, 22, 26, 14,  9);
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

    // Stone wall background
    this.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x020911).setDepth(-15);
    const wallG = this.add.graphics().setDepth(-13);
    wallG.lineStyle(1, 0x0b1e2d, 0.8);
    for (let y = 0; y < this.worldHeight; y += 80) wallG.lineBetween(0, y, this.worldWidth, y);
    for (let row = 0; row < Math.ceil(this.worldHeight / 80); row++) {
      const offset = (row % 2) * 100;
      for (let x = offset; x < this.worldWidth + 100; x += 200) wallG.lineBetween(x, row * 80, x, (row + 1) * 80);
    }

    // Background columns for depth
    [160, 550, 1000, 1450, 1900, 2150].forEach((cx) => {
      this.add.rectangle(cx, this.worldHeight / 2 - 30, 36, this.worldHeight - 100, 0x060f1c).setDepth(-10);
      this.add.rectangle(cx, this.worldHeight / 2 - 30, 36, this.worldHeight - 100, 0, 0)
        .setStrokeStyle(1, 0x1a3550, 0.6).setDepth(-9);
      this.add.rectangle(cx, 38,                    52, 20, 0x0a1d2e).setStrokeStyle(1, 0x204558, 0.5).setDepth(-9);
      this.add.rectangle(cx, this.worldHeight - 58, 52, 20, 0x0a1d2e).setStrokeStyle(1, 0x204558, 0.5).setDepth(-9);
    });

    // Ground
    const ground = this.add.rectangle(this.worldWidth / 2, this.worldHeight - 36, this.worldWidth, 28, 0x0e2030).setDepth(1);
    this.physics.add.existing(ground, true);
    this.colliders.push(ground);
    this.add.rectangle(this.worldWidth / 2, this.worldHeight - 50, this.worldWidth, 3, 0x5ee8ff, 0.3).setDepth(2);
    const groundG = this.add.graphics().setDepth(2);
    groundG.lineStyle(1, 0x1a3a52, 0.5);
    for (let x = 0; x < this.worldWidth; x += 140) groundG.lineBetween(x, this.worldHeight - 50, x, this.worldHeight - 22);

    // Platforms
    const platforms = [
      { x: 380,  y: 780, w: 230 }, { x: 1100, y: 780, w: 230 }, { x: 1820, y: 780, w: 230 },
      { x: 700,  y: 640, w: 210 }, { x: 1500, y: 640, w: 210 },
      { x: 1100, y: 500, w: 220 }, { x: 1100, y: 360, w: 200 },
    ];
    platforms.forEach(({ x, y, w }) => {
      const plat = this.add.rectangle(x, y, w, 16, 0x0f2540).setDepth(2);
      this.physics.add.existing(plat, true);
      this.colliders.push(plat);
      this.add.rectangle(x, y - 6, w - 2, 2, 0x5ee8ff, 0.65).setDepth(3);
      this.add.rectangle(x, y + 5, w, 4, 0x060f1c, 0.65).setDepth(3);
      const pg = this.add.graphics().setDepth(3);
      pg.lineStyle(1, 0x1c3e5a, 0.5);
      for (let xi = x - w / 2 + 40; xi < x + w / 2; xi += 40) pg.lineBetween(xi, y - 7, xi, y + 7);
    });

    // Torch orbs for atmosphere
    [380, 700, 1100, 1500, 1820].forEach((tx, i) => {
      const orb = this.add.circle(tx, this.worldHeight - 58, 4, 0xff9933, 0.9).setDepth(4);
      this.add.circle(tx, this.worldHeight - 58, 16, 0xff6600, 0.1).setDepth(3);
      this.tweens.add({ targets: orb, alpha: 0.45, scale: 0.7, duration: 600 + i * 130, yoyo: true, repeat: -1 });
    });
  }

  // ── LOCAL PLAYER ─────────────────────────────────────────────────────────────

  private createLocalPlayer() {
    this.player = this.physics.add.sprite(1100, 860, 'char-idle');
    this.player
      .setDisplaySize(40, 40).setTint(0x00ff00)
      .setCollideWorldBounds(true).setBounce(0.05)
      .setDragX(this.drag).setMaxVelocity(this.moveSpeed, this.maxFallSpeed)
      .setDepth(6);
    this.player.play('char-idle');
    this.cameras.main.startFollow(this.player, true, 0.10, 0.10);

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
      if (data.remaining <= 10) this.timerText.setColor('#ff5555');
      else if (data.remaining <= 30) this.timerText.setColor('#ffaa44');
      else this.timerText.setColor('#dff8ff');
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
        .setDisplaySize(40, 40).setTint(tint).setDepth(5);
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
    ['localPlayer','currentPlayers','playerJoined','playerMoved','playersUpdated',
      'attackVisual','hitVisual','playerKilled','duplicateConnection','playerLeft','timerUpdate','gameOver']
      .forEach((e) => socket.off(e));
    this.hasJoinedGame = false;
  }

  // ── COMBAT VISUALS ───────────────────────────────────────────────────────────

  private handleLocalDeath() {
    if (this.isDying) return;
    this.isDying = true;
    this.player.setTint(0xff4444);
    this.cameras.main.shake(200, 0.008);
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
    remote.sprite.setTint(0xff4444);
    this.tweens.add({ targets: [remote.sprite, remote.name], alpha: 0, duration: 400 });
  }

  private flashPlayerHit() {
    this.player.setTint(0xffffff);
    this.time.delayedCall(110, () => { if (!this.isDying) this.player.setTint(0x00ff00); });
  }

  private flashRemotePlayerHit(id: string) {
    const remote = this.otherPlayers[id];
    const data = this.playerData[id];
    if (!remote || !data) return;
    remote.sprite.setTint(0xffffff);
    this.time.delayedCall(110, () => {
      if (this.otherPlayers[id]) this.otherPlayers[id].sprite.setTint(Number(data.color.replace('#', '0x')));
    });
  }

  private drawCooldownBar(time: number) {
    this.localCooldownBar.clear();
    const ratio = Math.min((time - this.lastLocalAttackTime) / this.localAttackCooldown, 1);
    const bx = this.player.x - 20, by = this.player.y + 26;
    this.localCooldownBar.fillStyle(0x020811, 0.65).fillRect(bx, by, 40, 3);
    if (ratio > 0) this.localCooldownBar.fillStyle(ratio >= 1 ? 0x5ee8ff : 0xff8844, 0.9).fillRect(bx, by, 40 * ratio, 3);
  }

  private showAttackEffect(x: number, y: number, direction: Direction) {
    const ox = direction === 'right' ? 52 : -52;
    const arc = this.add.graphics().setDepth(50);
    arc.lineStyle(3, 0x88ffff, 0.9);
    arc.beginPath();
    const startAngle = direction === 'right' ? -0.6 : Math.PI + 0.6;
    const endAngle   = direction === 'right' ?  0.6 : Math.PI - 0.6;
    arc.arc(x + ox, y, 26, startAngle, endAngle, direction === 'right');
    arc.strokePath();
    arc.lineStyle(1, 0xeeffff, 0.5);
    arc.arc(x + ox, y, 32, startAngle, endAngle, direction === 'right');
    arc.strokePath();
    this.tweens.add({ targets: arc, alpha: 0, scaleX: 1.15, scaleY: 1.15, duration: 130, onComplete: () => arc.destroy() });
  }

  private showHitEffect(x: number, y: number) {
    const g = this.add.graphics().setDepth(60);
    g.fillStyle(0xffffff, 0.85).fillCircle(x, y, 10);
    g.lineStyle(2, 0xffeeaa, 0.9);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineBetween(x + Math.cos(a) * 10, y + Math.sin(a) * 10, x + Math.cos(a) * 22, y + Math.sin(a) * 22);
    }
    this.tweens.add({ targets: g, alpha: 0, scale: 1.5, duration: 180, onComplete: () => g.destroy() });
  }

  private drawHpBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, hp: number) {
    const w = 48, h = 6, fill = Phaser.Math.Clamp(hp, 0, 100) / 100;
    graphics.clear();
    graphics.fillStyle(0x050c13, 0.9).fillRoundedRect(x - w / 2, y, w, h, 3);
    graphics.fillStyle(0x40deaa, 0.95).fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * fill, h - 2, 2);
    graphics.lineStyle(1, 0x5ee8ff, 0.8).strokeRoundedRect(x - w / 2, y, w, h, 3);
  }
}
