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
  rect: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private attackKeyAlt!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;

  private otherPlayers: Record<string, PlayerUi> = {};
  private playerData: Record<string, PlayerData> = {};

  private localPlayerId: string | null = null;
  private readonly localIdentityId = getClientIdentity().id;
  private localNameText!: Phaser.GameObjects.Text;
  private localHpBar!: Phaser.GameObjects.Graphics;
  private colliders: Phaser.GameObjects.Rectangle[] = [];

  private lastSent = 0;
  private currentDirection: Direction = 'right';
  private hasJoinedGame = false;

  private wasJumpPressed = false;
  private wasAttackPressed = false;
  private lastGroundedTime = 0;
  private lastJumpPressedTime = 0;
  private lastLocalAttackTime = 0;

  private readonly moveSpeed = 280;
  private readonly acceleration = 1600;
  private readonly drag = 1800;
  private readonly jumpForce = -560;
  private readonly maxFallSpeed = 850;
  private readonly coyoteTime = 100;
  private readonly jumpBufferTime = 100;
  private readonly localAttackCooldown = 500;
  private readonly worldWidth = 2200;
  private readonly worldHeight = 980;

  constructor() {
    super('GameScene');
  }

  create() {
    enableGameplayLayout();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);

    this.createPlayerTexture();
    this.createLocalPlayer();
    this.createWorld();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.attackKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.attackKeyAlt = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.colliders.forEach((obj) => this.physics.add.collider(this.player, obj));

    this.hudText = createHud(this);

    this.registerSocketEvents();
    this.joinGameOnce();
  }

  update(time: number) {
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
    if (moveLeft) {
      this.currentDirection = 'left';
      this.player.setAccelerationX(-this.acceleration);
    }
    if (moveRight) {
      this.currentDirection = 'right';
      this.player.setAccelerationX(this.acceleration);
    }

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

    this.updateLocalPlayerUi();

    if (time - this.lastSent > 30) {
      socket.emit('playerMove', { x: this.player.x, y: this.player.y, direction: this.currentDirection });
      this.lastSent = time;
    }
  }

  private createWorld() {
    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    const ground = this.add.rectangle(this.worldWidth / 2, this.worldHeight - 36, this.worldWidth, 28, 0x162738);
    this.physics.add.existing(ground, true);
    this.colliders.push(ground);

    const platforms = [
      { x: 440, y: 740, w: 210 },
      { x: 700, y: 650, w: 200 },
      { x: 980, y: 580, w: 220 },
      { x: 1220, y: 580, w: 220 },
      { x: 1500, y: 650, w: 200 },
      { x: 1760, y: 740, w: 210 },
      { x: 1100, y: 500, w: 170 },
    ];

    platforms.forEach(({ x, y, w }) => {
      const platform = this.add.rectangle(x, y, w, 16, 0x284356).setStrokeStyle(1, 0x5ee8ff, 0.45);
      this.physics.add.existing(platform, true);
      this.colliders.push(platform);
    });

  }

  private createLocalPlayer() {
    this.player = this.physics.add.sprite(240, 560, 'player-square');
    this.player.setDisplaySize(40, 40).setTint(0x00ff00).setCollideWorldBounds(true).setBounce(0.05).setDragX(this.drag).setMaxVelocity(this.moveSpeed, this.maxFallSpeed);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    this.localNameText = this.add.text(this.player.x, this.player.y - 52, getPlayerDisplayName(), {
      fontSize: '12px', color: '#e9feff', backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(40);

    this.localHpBar = this.add.graphics().setDepth(39);
    this.drawHpBar(this.localHpBar, this.player.x, this.player.y - 36, 100);
  }

  private joinGameOnce() {
    if (this.hasJoinedGame) return;
    socket.emit('joinGame', { ...getClientIdentity(), name: getPlayerDisplayName() });
    this.hasJoinedGame = true;
  }

  private registerSocketEvents() {
    socket.off('localPlayer');
    socket.off('currentPlayers');
    socket.off('playerJoined');
    socket.off('playerMoved');
    socket.off('playersUpdated');
    socket.off('attackVisual');
    socket.off('hitVisual');
    socket.off('playerKilled');
    socket.off('duplicateConnection');
    socket.off('playerLeft');

    socket.on('localPlayer', (data: { id: string }) => {
      this.localPlayerId = data.id;
      this.removeRemotePlayer(data.id);
    });
    socket.on('currentPlayers', (players: Record<string, PlayerData>) => this.upsertPlayers(players));
    socket.on('playerJoined', (player: PlayerData) => this.upsertPlayers({ ...this.playerData, [player.id]: player }));
    socket.on('playersUpdated', (players: Record<string, PlayerData>) => this.upsertPlayers(players));

    socket.on('playerMoved', (player: { id: string; x: number; y: number; direction: Direction }) => {
      const current = this.playerData[player.id];
      if (current) Object.assign(current, player);
      const remote = this.otherPlayers[player.id];
      if (remote) {
        remote.rect.setPosition(player.x, player.y);
        this.updateRemoteUi(player.id);
      }
    });

    socket.on('attackVisual', (data: { attackerId: string; x: number; y: number; direction: Direction }) => {
      if (data.attackerId !== this.localPlayerId) this.showAttackEffect(data.x, data.y, data.direction);
    });
    socket.on('hitVisual', (data: { x: number; y: number }) => this.showHitEffect(data.x, data.y));
    socket.on('playerKilled', () => this.cameras.main.shake(120, 0.004));
    socket.on('duplicateConnection', () => { alert('Esta cuenta se abrió en otro dispositivo.'); socket.disconnect(); });
    socket.on('playerLeft', (id: string) => this.removeRemotePlayer(id));
  }

  private upsertPlayers(players: Record<string, PlayerData>) {
    this.playerData = players;
    Object.values(players).forEach((player) => {
      if (player.id === this.localIdentityId || player.id === this.localPlayerId) {
        this.player.setPosition(player.x, player.y);
        this.currentDirection = player.direction;
      } else {
        this.addOrUpdateRemotePlayer(player);
      }
    });
    Object.keys(this.otherPlayers).forEach((id) => { if (!players[id]) this.removeRemotePlayer(id); });
    this.refreshHud();
    this.updateLocalPlayerUi();
  }

  private addOrUpdateRemotePlayer(player: PlayerData) {
    if (!this.otherPlayers[player.id]) {
      const rect = this.add.rectangle(player.x, player.y, 40, 40, Number(player.color.replace('#', '0x')));
      const name = this.add.text(player.x, player.y - 66, player.name || 'Player', { fontSize: '12px', color: '#dff9ff', backgroundColor: 'rgba(1,9,16,0.75)', padding: { x: 6, y: 2 } }).setOrigin(0.5).setDepth(40);
      const hpBar = this.add.graphics().setDepth(39);
      this.otherPlayers[player.id] = { rect, name, hpBar };
    }

    const remote = this.otherPlayers[player.id];
    remote.rect.setPosition(player.x, player.y);
    this.updateRemoteUi(player.id);
  }

  private updateRemoteUi(id: string) {
    const player = this.playerData[id];
    const remote = this.otherPlayers[id];
    if (!player || !remote) return;
    remote.name.setText(player.name || 'Player').setPosition(remote.rect.x, remote.rect.y - 66);
    this.drawHpBar(remote.hpBar, remote.rect.x, remote.rect.y - 50, player.hp ?? 100);
  }

  private updateLocalPlayerUi() {
    this.localNameText.setText(getPlayerDisplayName()).setPosition(this.player.x, this.player.y - 66);
    const hp = this.localPlayerId ? this.playerData[this.localPlayerId]?.hp ?? 100 : 100;
    this.drawHpBar(this.localHpBar, this.player.x, this.player.y - 50, hp);
  }

  private drawHpBar(graphics: Phaser.GameObjects.Graphics, x: number, y: number, hp: number) {
    const width = 48;
    const height = 6;
    const fill = Phaser.Math.Clamp(hp, 0, 100) / 100;
    graphics.clear();
    graphics.fillStyle(0x050c13, 0.9).fillRoundedRect(x - width / 2, y, width, height, 3);
    graphics.fillStyle(0x40deaa, 0.95).fillRoundedRect(x - width / 2 + 1, y + 1, (width - 2) * fill, height - 2, 2);
    graphics.lineStyle(1, 0x5ee8ff, 0.8).strokeRoundedRect(x - width / 2, y, width, height, 3);
  }

  private removeRemotePlayer(id: string) {
    const remote = this.otherPlayers[id];
    if (remote) {
      remote.rect.destroy();
      remote.name.destroy();
      remote.hpBar.destroy();
      delete this.otherPlayers[id];
    }
    delete this.playerData[id];
    this.refreshHud();
  }

  private refreshHud() { updateHud(this.hudText, this.playerData, this.localPlayerId); }

  private cleanupScene() {
    disableGameplayLayout();
    socket.off('localPlayer'); socket.off('currentPlayers'); socket.off('playerJoined'); socket.off('playerMoved');
    socket.off('playersUpdated'); socket.off('attackVisual'); socket.off('hitVisual'); socket.off('playerKilled'); socket.off('duplicateConnection'); socket.off('playerLeft');
    this.hasJoinedGame = false;
  }

  private showAttackEffect(x: number, y: number, direction: Direction) { const offsetX = direction === 'right' ? 52 : -52; const attack = this.add.rectangle(x + offsetX, y, 60, 42, 0x00ffff, 0.35).setStrokeStyle(2, 0x99ffff).setDepth(50); this.tweens.add({ targets: attack, alpha: 0, duration: 120, onComplete: () => attack.destroy() }); }
  private showHitEffect(x: number, y: number) { const hit = this.add.circle(x, y, 18, 0xffffff, 0.75).setDepth(60); this.tweens.add({ targets: hit, alpha: 0, scale: 2, duration: 160, onComplete: () => hit.destroy() }); }
  private createPlayerTexture() { if (this.textures.exists('player-square')) return; const g = this.add.graphics(); g.lineStyle(3, 0xffffff); g.strokeRect(0, 0, 40, 40); g.lineBetween(0, 0, 40, 40); g.generateTexture('player-square', 40, 40); g.destroy(); }
}
