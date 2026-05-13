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
    this.add.rectangle(width / 2, height / 2, width * 0.95, height * 0.95, 0x02070d, 0.3).setStrokeStyle(1, 0x5ee8ff, 0.2);
    this.tweens.add({ targets: bg, scale: bg.scale * 1.02, duration: 10000, yoyo: true, repeat: -1 });

    this.createTitle(width, height);
    this.createPlayerCard(width, height);
    this.createButtons(width, height);
  }

  private createTitle(width: number, height: number) {
    this.add.text(width / 2, height * 0.12, 'ARENA BRAWLER', { fontSize: `${Math.max(30, Math.round(width * 0.08))}px`, color: '#98f5ff', fontStyle: 'bold' }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 16);
    this.add.text(width / 2, height * 0.17, '2D', { fontSize: `${Math.max(22, Math.round(width * 0.055))}px`, color: '#d9fdff', fontStyle: 'bold' }).setOrigin(0.5).setShadow(0, 0, '#2dd7e6', 12);
  }

  private createPlayerCard(width: number, height: number) {
    const identity = getClientIdentity();
    const panelW = Math.min(width * 0.84, 430);
    const panelH = 120;
    const x = width / 2;
    const y = height * 0.34;
    this.add.rectangle(x, y, panelW, panelH, 0x020811, 0.72).setStrokeStyle(1, 0x5ee8ff, 0.65);

    const avatarX = x - panelW / 2 + 56;
    const avatarY = y;
    const maskCircle = this.add.circle(avatarX, avatarY, 26, 0xffffff, 1).setVisible(false);
    const mask = maskCircle.createGeometryMask();
    const fallback = () => {
      this.add.circle(avatarX, avatarY, 26, 0x08121e, 1).setStrokeStyle(2, 0x8eefff, 0.8);
      this.add.text(avatarX, avatarY, getPlayerDisplayName().charAt(0).toUpperCase(), { fontSize: '24px', color: '#dff8ff', fontStyle: 'bold' }).setOrigin(0.5);
    };

    if (identity.photoUrl) {
      const photoKey = `tg-avatar-${identity.id}`;
      this.load.image(photoKey, identity.photoUrl);
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => fallback());
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (!this.textures.exists(photoKey)) return fallback();
        const avatar = this.add.image(avatarX, avatarY, photoKey).setDisplaySize(52, 52);
        avatar.setMask(mask);
        this.add.circle(avatarX, avatarY, 27).setStrokeStyle(2, 0x8eefff, 0.8);
      });
      this.load.start();
    } else {
      console.log('Telegram sin photoUrl, mostrando inicial de fallback.');
      fallback();
    }

    this.aliasText = this.add.text(avatarX + 46, y - 14, getPlayerDisplayName(), { fontSize: '20px', color: '#e8feff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.add.text(avatarX + 46, y + 16, 'Editar alias', { fontSize: '13px', color: '#8eefff', fontStyle: 'bold' })
      .setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const next = window.prompt('Ingresá tu alias de juego', getPlayerDisplayName());
        if (next === null) return;
        savePlayerAlias(next);
        this.aliasText.setText(getPlayerDisplayName());
      });
  }

  private createButtons(width: number, height: number) {
    const labels = ['CREAR PARTIDA', 'UNIRSE A PARTIDA', 'ENTRAR A ARENA'];
    labels.forEach((label, i) => {
      const y = height * 0.56 + i * 64;
      const button = this.add.rectangle(width / 2, y, Math.min(width * 0.74, 390), 46, i === 2 ? 0x114a58 : 0x0a1b2d, 0.9).setStrokeStyle(1, 0x5ee8ff, 0.8);
      const text = this.add.text(width / 2, y, label, { fontSize: '18px', color: '#eaffff', fontStyle: 'bold' }).setOrigin(0.5);
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
