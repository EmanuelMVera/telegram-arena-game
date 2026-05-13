import Phaser from 'phaser';
import { getClientIdentity, getPlayerDisplayName, savePlayerAlias } from '../telegram/telegram';

export class MainMenuScene extends Phaser.Scene {
  private aliasText!: Phaser.GameObjects.Text;

  constructor() { super('MainMenuScene'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#050c14');
    const bg = this.add.image(width / 2, height / 2, 'loading-background').setScale(Math.max(width / 1600, height / 900)).setDepth(-20);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55).setDepth(-10);
    this.add.rectangle(width / 2, height / 2, width * 0.95, height * 0.95, 0x02070d, 0.35).setStrokeStyle(1, 0x5ee8ff, 0.2);
    for (let i = 0; i < 30; i += 1) {
      const p = this.add.circle(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height), Phaser.Math.FloatBetween(1, 2.6), 0x57eaff, Phaser.Math.FloatBetween(0.2, 0.55));
      this.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(50, 120), alpha: 0, duration: Phaser.Math.Between(2500, 5200), repeat: -1, delay: Phaser.Math.Between(0, 2000) });
    }
    this.tweens.add({ targets: bg, scale: bg.scale * 1.02, duration: 10000, yoyo: true, repeat: -1 });

    this.createTitle(width, height);
    this.createPlayerCard(width, height);
    this.createButtons(width, height);
  }

  private createTitle(width: number, height: number) {
    this.add.text(width / 2, height * 0.1, 'ARENA\nBRAWLER 2D', { align: 'center', fontSize: `${Math.max(30, Math.round(width * 0.07))}px`, color: '#a7f7ff', fontStyle: 'bold', lineSpacing: 6 }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 18);
    this.add.rectangle(width / 2, height * 0.18, Math.min(width * 0.5, 280), 2, 0x72f7ff, 0.65);
  }

  private createPlayerCard(width: number, height: number) {
    const identity = getClientIdentity();
    const panelW = Math.min(width * 0.84, 430);
    const panelH = 260;
    const x = width / 2;
    const y = height * 0.35;
    this.add.rectangle(x, y, panelW, panelH, 0x020811, 0.4).setStrokeStyle(1, 0x5ee8ff, 0.4);

    const avatarX = x;
    const avatarY = y - 45;
    const avatarR = 78;
    this.add.circle(avatarX, avatarY, avatarR + 10, 0x081a2a, 0.75).setStrokeStyle(3, 0x6eeeff, 0.8);
    const maskCircle = this.add.circle(avatarX, avatarY, avatarR, 0xffffff, 1).setVisible(false);
    const mask = maskCircle.createGeometryMask();
    const fallback = () => {
      this.add.circle(avatarX, avatarY, avatarR, 0x08121e, 1).setStrokeStyle(2, 0x8eefff, 0.8);
      this.add.text(avatarX, avatarY, getPlayerDisplayName().charAt(0).toUpperCase(), { fontSize: '54px', color: '#dff8ff', fontStyle: 'bold' }).setOrigin(0.5);
    };

    if (identity.photoUrl) {
      const photoKey = `tg-avatar-${identity.id}`;
      this.load.image(photoKey, identity.photoUrl);
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => fallback());
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (!this.textures.exists(photoKey)) return fallback();
        const avatar = this.add.image(avatarX, avatarY, photoKey).setDisplaySize(avatarR * 2, avatarR * 2);
        avatar.setMask(mask);
        this.add.circle(avatarX, avatarY, avatarR + 2).setStrokeStyle(2, 0x8eefff, 0.8);
      });
      this.load.start();
    } else {
      console.log('Telegram sin photoUrl, mostrando inicial de fallback.');
      fallback();
    }

    this.aliasText = this.add.text(avatarX, y + 60, getPlayerDisplayName(), { fontSize: '40px', color: '#e8feff', fontStyle: 'bold' }).setOrigin(0.5);
    const editAlias = this.add.text(avatarX, y + 94, '✎ Editar alias', { fontSize: '17px', color: '#8eefff', fontStyle: 'bold', backgroundColor: 'rgba(3,28,44,0.65)', padding: { x: 12, y: 6 } })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const next = window.prompt('Ingresá tu alias de juego', getPlayerDisplayName());
        if (next === null) return;
        savePlayerAlias(next);
        this.aliasText.setText(getPlayerDisplayName());
      });
    editAlias.setStroke('#47d6ea', 1);
  }

  private createButtons(width: number, height: number) {
    const labels = ['CREAR PARTIDA', 'UNIRSE A PARTIDA', 'ENTRAR A ARENA'];
    labels.forEach((label, i) => {
      const y = height * 0.66 + i * 78;
      const button = this.add.rectangle(width / 2, y, Math.min(width * 0.78, 420), 56, i === 2 ? 0x15596a : 0x0b2238, 0.95).setStrokeStyle(2, 0x63efff, 0.95);
      const text = this.add.text(width / 2, y, label, { fontSize: '28px', color: '#eaffff', fontStyle: 'bold' }).setOrigin(0.5);
      button.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.tweens.add({ targets: [button, text], alpha: 0.8, yoyo: true, duration: 100 });
        if (i < 2) return this.showToast('Próximamente');
        this.cameras.main.fadeOut(320, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
      });
    });
  }

  private showToast(message: string) { const { width, height } = this.scale; const t = this.add.text(width / 2, height * 0.88, message, { fontSize: '14px', color: '#dff8ff', backgroundColor: 'rgba(1,8,16,0.8)', padding: { x: 12, y: 6 } }).setOrigin(0.5); this.tweens.add({ targets: t, alpha: 0, y: t.y - 12, duration: 1000, onComplete: () => t.destroy() }); }
}
