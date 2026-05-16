import Phaser from 'phaser';
import type { Direction } from '../types/player';

export interface PlayerConfig {
  isLocal: boolean;
  name: string;
  tint?: number;
  depth?: number;
}

// ── Tuning knobs ──────────────────────────────────────────────────────────────
// Change these constants to adjust size, hitbox and jump feel without touching logic.

const PLAYER_SCALE = 140;   // display size (px). Raise → bigger character.

// Physics hitbox — smaller than display so the character doesn't "float"
const BODY_W = 52;
const BODY_H = 100;

// FOOT_INSET: transparent space below the feet inside the sprite frame (px).
// 0 → body bottom = sprite bottom exactly.
// Increase if the character appears to float above the ground.
const FOOT_INSET = 4;

// Jump spritesheet fps (man-jump and man-attack share the same source rate)
const JUMP_FPS = 14;

// How many startup frames play on the ground before the jump velocity fires.
// Frames 1–5 (indices 0–4) are the crouch/impulse; velocity fires on frame 6.
const JUMP_TAKEOFF_FRAME = 5;

// Frame 4 of attack (1-indexed) = index 3 at 14 fps → hit-callback delay
const ATTACK_HIT_DELAY = Math.round(3 * 1000 / JUMP_FPS); // ≈ 214 ms

// ── Derived — do not touch these ─────────────────────────────────────────────
const BODY_OFF_X = (PLAYER_SCALE - BODY_W) / 2;
// body.bottom = sprite.y + PLAYER_SCALE/2 − FOOT_INSET  (flush with visual feet)
const BODY_OFF_Y = PLAYER_SCALE - BODY_H - FOOT_INSET;
// Delay between "jump pressed" and physics velocity being applied
const TAKEOFF_PHYSICS_MS = Math.round(JUMP_TAKEOFF_FRAME * 1000 / JUMP_FPS); // ≈ 357 ms

// ─────────────────────────────────────────────────────────────────────────────

type JumpPhase = 'none' | 'jump_start' | 'air_up' | 'air_down' | 'land';

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly glow?: Phaser.GameObjects.Arc;
  private readonly scene: Phaser.Scene;
  readonly isLocal: boolean;
  private tintColor: number;

  private jumpPhase: JumpPhase = 'none';
  private wasGrounded = true;
  private isAttacking = false;
  private readonly idleFallbackAnim = 'man-idle';

  constructor(scene: Phaser.Scene, x: number, y: number, config: PlayerConfig) {
    this.scene    = scene;
    this.isLocal  = config.isLocal;
    this.tintColor = config.tint ?? 0xffffff;

    const depth = config.depth ?? (config.isLocal ? 6 : 5);

    this.sprite = scene.physics.add.sprite(x, y, 'man-idle')
      .setDisplaySize(PLAYER_SCALE, PLAYER_SCALE)
      .setOrigin(0.5, 1)
      .setDepth(depth)
      .play(this.idleFallbackAnim);

    if (config.isLocal) {
      this.sprite
        .setCollideWorldBounds(true)
        .setBounce(0)
        .setMaxVelocity(280, 850);
    } else {
      this.sprite.setTint(this.tintColor);
      (this.sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
    }

    this.sprite.setBodySize(BODY_W, BODY_H);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setOffset(BODY_OFF_X, BODY_OFF_Y);

    if (config.isLocal) {
      this.glow = scene.add.circle(x, y, 34, 0x5ee8ff, 0.07).setDepth(depth - 1);
      scene.tweens.add({
        targets: this.glow,
        alpha: { from: 0.03, to: 0.12 }, scale: { from: 0.88, to: 1.12 },
        duration: 1300, yoyo: true, repeat: -1,
      });
    }

    const labelY = y - PLAYER_SCALE - 16;
    this.nameText = scene.add.text(x, labelY, config.name, {
      fontSize: '12px', color: '#e9feff',
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(40);

    this.hpBar = scene.add.graphics().setDepth(39);
    this.drawHp(100);
  }

  // ── Position ──────────────────────────────────────────────────────────────────

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
  }

  // ── Direction ─────────────────────────────────────────────────────────────────

  setDirection(dir: Direction) {
    this.sprite.setFlipX(dir === 'left');
  }

  // ── Jump ──────────────────────────────────────────────────────────────────────

  /**
   * Initiates a jump. Returns false if already jumping (caller skips cooldown).
   *
   * On the ground: plays the 5-frame startup animation first, then calls
   * applyVelocity() at TAKEOFF_PHYSICS_MS (≈357 ms) so the character
   * physically launches only after the crouch/impulse animation is done.
   *
   * Coyote jump (wasGrounded=false): skips startup, launches immediately.
   */
  startJump(applyVelocity: () => void): boolean {
    if (this.jumpPhase !== 'none') return false;

    if (!this.wasGrounded) {
      // Coyote-time jump: no startup animation, instant takeoff
      applyVelocity();
      this.jumpPhase = 'air_up';
      this.playAnimSafe('man-jump-air');
      return true;
    }

    // Normal ground jump: startup frames first, then physics
    this.jumpPhase = 'jump_start';
    this.playAnimSafe('man-jump-start');

    // Apply physics velocity at the takeoff frame boundary
    this.scene.time.delayedCall(TAKEOFF_PHYSICS_MS, () => {
      if (this.jumpPhase === 'jump_start' && this.sprite.active) {
        applyVelocity();
        // Keep startup animation running — the takeoff frame (index 5) plays
        // for its remaining duration before animationcomplete switches to air
      }
    });

    // Switch to air phase once all startup frames have played
    this.sprite.once('animationcomplete-man-jump-start', () => {
      if (this.jumpPhase === 'jump_start' && this.sprite.active) {
        this.jumpPhase = 'air_up';
        this.playAnimSafe('man-jump-air');
      }
    });

    return true;
  }

  // ── Animation state machine ────────────────────────────────────────────────────

  /**
   * Call every frame with current physics state.
   * Handles: ground locomotion, spontaneous fall, air sub-phases, landing.
   * Does NOT initiate jumps — that is done by startJump().
   */
  updateAnimation(isGrounded: boolean, velX: number, velY: number) {
    // Never override animation while attacking
    if (this.isAttacking) { this.wasGrounded = isGrounded; return; }

    // ── Landing ──────────────────────────────────────────────────────────────
    const justLanded = !this.wasGrounded && isGrounded;
    if (justLanded && this.jumpPhase !== 'none' && this.jumpPhase !== 'jump_start' && this.jumpPhase !== 'land') {
      this.jumpPhase = 'land';
      this.playAnimSafe('man-jump-land');
      this.sprite.once('animationcomplete-man-jump-land', () => {
        this.jumpPhase = 'none';
      });
      this.wasGrounded = isGrounded;
      return;
    }

    // ── Self-managed phases ───────────────────────────────────────────────────
    // jump_start is driven by the timer + animationcomplete in startJump().
    // land is driven by its own animationcomplete listener above.
    if (this.jumpPhase === 'jump_start' || this.jumpPhase === 'land') {
      this.wasGrounded = isGrounded;
      return;
    }

    // ── In air ───────────────────────────────────────────────────────────────
    if (!isGrounded) {
      if (this.jumpPhase === 'none') {
        // Spontaneous fall (walked off a ledge with no jump)
        this.jumpPhase = velY >= 0 ? 'air_down' : 'air_up';
        this.playAnimSafe(this.jumpPhase === 'air_down' ? 'man-jump-preland' : 'man-jump-air');
      } else if (velY > 80 && this.jumpPhase !== 'air_down') {
        this.jumpPhase = 'air_down';
        this.playAnimSafe('man-jump-preland');
      } else if (velY <= 80 && this.jumpPhase !== 'air_up') {
        this.jumpPhase = 'air_up';
        this.playAnimSafe('man-jump-air');
      }
      this.wasGrounded = isGrounded;
      return;
    }

    // ── Ground locomotion ─────────────────────────────────────────────────────
    if (this.jumpPhase === 'none') {
      this.playAnimSafe(Math.abs(velX) > 30 ? 'man-run' : 'man-idle');
    }

    this.wasGrounded = isGrounded;
  }

  // ── Attack ────────────────────────────────────────────────────────────────────

  /** Returns false if already attacking (caller can skip cooldown reset). */
  playAttack(onHitFrame?: () => void): boolean {
    if (this.isAttacking) return false;

    // Attacking on the ground cancels any pending jump startup
    if (this.jumpPhase === 'jump_start') this.jumpPhase = 'none';

    this.isAttacking = true;
    this.playAnimSafe('man-attack');

    this.scene.time.delayedCall(ATTACK_HIT_DELAY, () => {
      if (this.sprite.active) onHitFrame?.();
    });

    this.sprite.once('animationcomplete-man-attack', () => {
      this.isAttacking = false;
      this.resumeAfterInterrupt();
    });

    return true;
  }

  // ── Hurt ──────────────────────────────────────────────────────────────────────

  playHurt() {
    if (!this.sprite.active || this.isAttacking) return;
    // Hurt cancels any pending jump startup so velocity is never applied silently
    if (this.jumpPhase === 'jump_start') this.jumpPhase = 'none';
    this.playAnimSafe('man-hurt');
    this.scene.time.delayedCall(220, () => {
      if (this.sprite.active && !this.isAttacking) this.resumeAfterInterrupt();
    });
  }

  // ── UI ────────────────────────────────────────────────────────────────────────

  updateUi(name: string, hp: number) {
    const nx = this.sprite.x;
    const ny = this.sprite.y;
    this.nameText.setText(name).setPosition(nx, ny - PLAYER_SCALE - 16);
    this.hpBar.setPosition(0, 0);
    this.drawHp(hp);
    if (this.glow) this.glow.setPosition(nx, ny);
  }

  private drawHp(hp: number) {
    const x = this.sprite.x;
    const y = this.sprite.y - PLAYER_SCALE + 4;
    const w = 60, h = 6, fill = Phaser.Math.Clamp(hp, 0, 100) / 100;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x050c13, 0.9).fillRoundedRect(x - w / 2, y, w, h, 3);
    const color = fill > 0.5 ? 0x40deaa : fill > 0.25 ? 0xddaa22 : 0xdd3333;
    this.hpBar.fillStyle(color, 0.95).fillRoundedRect(x - w / 2 + 1, y + 1, (w - 2) * fill, h - 2, 2);
    this.hpBar.lineStyle(1, 0x5ee8ff, 0.72).strokeRoundedRect(x - w / 2, y, w, h, 3);
  }

  // ── Combat ────────────────────────────────────────────────────────────────────

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
    this.playAnimSafe('man-death');
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, duration: 550, ease: 'Power2',
      onComplete: () => onComplete(),
    });
  }

  respawn(x: number, y: number) {
    this.isAttacking = false;
    this.jumpPhase   = 'none';
    this.wasGrounded = true;
    this.sprite.setAlpha(1).clearTint().setPosition(x, y);
    this.playAnimSafe(this.idleFallbackAnim);
  }

  // ── Visibility ────────────────────────────────────────────────────────────────

  setAlpha(a: number) {
    this.sprite.setAlpha(a);
    this.nameText.setAlpha(a);
  }

  setVisible(v: boolean) {
    this.sprite.setVisible(v);
    this.nameText.setVisible(v);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  destroy() {
    this.sprite.destroy();
    this.nameText.destroy();
    this.hpBar.destroy();
    this.glow?.destroy();
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  /** Re-enter the correct animation after attack or hurt finishes. */
  private resumeAfterInterrupt() {
    if (!this.sprite.active) return;
    switch (this.jumpPhase) {
      case 'none':
        this.sprite.play('man-idle', true);
        break;
      case 'land':
        this.sprite.play('man-jump-land', true);
        this.sprite.once('animationcomplete-man-jump-land', () => { this.jumpPhase = 'none'; });
        break;
      case 'jump_start':
        // Startup was interrupted mid-air: skip to rising phase
        this.jumpPhase = 'air_up';
        this.sprite.play('man-jump-air', true);
        break;
      case 'air_down':
        this.sprite.play('man-jump-preland', true);
        break;
      default: // air_up
        this.sprite.play('man-jump-air', true);
    }
  }

  private playAnimSafe(animKey: string) {
    if (this.scene.anims.exists(animKey)) {
      this.sprite.play(animKey, true);
      return;
    }

    console.warn(`[Player] Missing animation "${animKey}". Falling back to "${this.idleFallbackAnim}".`);
    if (this.scene.anims.exists(this.idleFallbackAnim)) {
      this.sprite.play(this.idleFallbackAnim, true);
    }
  }
}
