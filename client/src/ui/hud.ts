import type { PlayerData } from "../types/player";

export function createHud(scene: Phaser.Scene) {
  const hudText = scene.add.text(14, 12, "", {
    fontSize: "13px",
    color: "#9aeeff",
    backgroundColor: "rgba(2,10,20,0.72)",
    padding: { x: 10, y: 6 },
  });
  hudText.setScrollFactor(0);
  hudText.setDepth(100);
  return hudText;
}

export function updateHud(
  hudText: Phaser.GameObjects.Text,
  players: Record<string, PlayerData>,
  localPlayerId: string | null,
) {
  if (!localPlayerId) { hudText.setText(""); return; }
  const me = players[localPlayerId];
  if (!me) { hudText.setText(""); return; }
  hudText.setText(`K: ${me.kills ?? 0}   D: ${me.deaths ?? 0}`);
}
