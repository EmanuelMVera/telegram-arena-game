import Phaser from 'phaser';
import type { Direction } from '../types/player';

export interface PlayerConfig {
  isLocal: boolean;
  name: string;
  tint?: number;
  depth?: number;
}

// Display size of the warrior sprite on screen (sprites are 1254×1254 source)
const DISPLAY_SIZE = 80;
// Physics body size (smaller than display to avoid floating / wall-clipping)
const BODY_W = 44;
const BODY_H = 60;
// Body offset to center the hitbox within the displayed sprite
const BODY_OFF_X = (DISPLAY_SIZE - BODY_W) / 2;
const BODY_OFF_Y = (DISPLAY_SIZE - BODY_H) / 2 + 4;

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly glow?: Phaser.GameObjects.Arc;
  private readonly scene: Phaser.Scene;
  readonly isLocal: boolean;
  private tintColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig) {
    this.scene   = scene;
    this.isLocal = config.isLocal;
    this.tintColor = config.tint ?? 0xffffff;

    const depth = config.depth ?? (config.isLocal ? 6 : 5);

    // Physics sprite — used by both local (active physics) and remote (position-only)
    this.sprite = scene.physics.add.sprite(x, y, 'warrior-idle')
      .setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE)
      .setDepth(depth)
      .play('warrior-idle');

    if (config.isLocal) {
      this.sprite
        .setCollideWorldBounds(true)
        .setBounce(0.05)
        .setMaxVelocity(280, 850);
      // No tint for local — GameScene will apply server-assigned color
    } else {
      this.sprite.setTint(this.tintColor);
      // Disable physics for remote players; position is set directly from server
      (this.sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
    }

    this.sprite.setBodySize(BODY_W, BODY_H);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setOffset(BODY_OFF_X, BODY_OFF_Y);

    // Soul glow halo (local player only)
    if (config.isLocal) {
      this.glow = scene.add.circle(x, y, 28, 0x5ee8ff, 0.07).setDepth(depth - 1);
      scene.tweens.add({
        targets: this.glow,
        alpha: { from: 0.03, to: 0.12 }, scale: { from: 0.88, to: 1.12 },
        duration: 1300, yoyo: true, repeat: -1,
      });
    }

    // Name label
    this.nameText = scene.add.text(x, y - 54, config.name, {
      fontSize: '12px', color: '#e9feff',
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(40);

    // HP bar
    this.hpBar = scene.add.graphics().setDepth(39);
    this.drawHp(100);
  }

  // ── Position ─────────────────────────────────────────────────────────────────

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
  }

  // ── Direction ────────────────────────────────────────────────────────────────

  setDirection(dir: Direction) {
    this.sprite.setFlipX(dir === 'left');
  }

  // ── Animation ────────────────────────────────────────────────────────────────

  updateAnimation(isGrounded: boolean, velX: number, velY: number) {
    if (!isGrounded) {
      const key = velY > 80 ? 'warrior-fall' : 'warrior-jump';
      this.sprite.play(key, true);
    } else if (Math.abs(velX) > 30) {
      this.sprite.play('warrior-run', true);
    } else {
      this.sprite.play('warrior-idle', true);
    }
  }

  playAttack() {
    this.sprite.play('warrior-attack', true);
    // Return to idle after the attack frame
    this.scene.time.delayedCall(180, () => {
      if (this.sprite.active) this.sprite.play('warrior-idle', true);
    });
  }

  playHurt() {
    this.sprite.play('warrior-hurt', true);
    this.scene.time.delayedCall(200, () => {
      if (this.sprite.active) this.sprite.play('warrior-idle', true);
    });
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  updateUi(name: string, hp: number) {
    const nx = this.sprite.x;
    const ny = this.sprite.y;
    this.nameText.setText(name).setPosition(nx, ny - 54);
    this.hpBar.setPosition(0, 0);
    this.drawHp(hp);
    if (this.glow) this.glow.setPosition(nx, ny);
  }

  private drawHp(hp: number) {
    const x = this.sprite.x, y = this.sprite.y - 40;
    const w = 52, h = 6, fill = Phaser.Math.Clamp(hp, 0, 100) / 100;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x050c13, 0.9).fillRoundedRect(x - w / 2, y, w, h, 3);
    const color = fill > 0.5 ? 0x40deaa : fill > 0.25 ? 0xddaa22 : 0xdd3333;
    this.hpBar.fillStyle(color, 0.95).fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * fill, h - 2, 2);
    this.hpBar.lineStyle(1, 0x5ee8ff, 0.72).strokeRoundedRect(x - w / 2, y, w, h, 3);
  }

  // ── Combat ───────────────────────────────────────────────────────────────────

  flashHit() {
    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(110, () => {
      if (!this.sprite.active) return;
      if (this.isLocal) {
        this.sprite.clearTint();
      } else {
        this.sprite.setTint(this.tintColor);
      }
    });
  }

  soulBurst(count: number) {
    const { x, y } = this.sprite;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dist  = Phaser.Math.Between(28, 76);
      const orb   = this.scene.add.circle(x, y, Phaser.Math.Between(3, 7), 0x5ef0ff, 0.9).setDepth(65);
      this.scene.tweens.add({
        targets: orb,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 18,
        alpha: 0, scale: 0.2, duration: 620, ease: 'Power2',
        onComplete: () => orb.destroy(),
      });
    }
    const flash = this.scene.add.circle(x, y, 38, 0xffffff, 0.45).setDepth(64);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 3, duration: 280, onComplete: () => flash.destroy() });
  }

  die(onComplete: () => void) {
    this.sprite.play('warrior-death', true);
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, duration: 550, ease: 'Power2',
      onComplete: () => onComplete(),
    });
  }

  respawn(x: number, y: number) {
    this.sprite.setAlpha(1).clearTint().setPosition(x, y);
    this.sprite.play('warrior-idle', true);
  }

  // ── Visibility ───────────────────────────────────────────────────────────────

  setAlpha(a: number) {
    this.sprite.setAlpha(a);
    this.nameText.setAlpha(a);
  }

  setVisible(v: boolean) {
    this.sprite.setVisible(v);
    this.nameText.setVisible(v);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  destroy() {
    this.sprite.destroy();
    this.nameText.destroy();
    this.hpBar.destroy();
    this.glow?.destroy();
  }
}
