import type { PlayerData } from "../types/player";
import { getLayout } from "../utils/layout";

export function createHud(scene: Phaser.Scene) {
  const l = getLayout(scene.scale.width, scene.scale.height);
  const hudText = scene.add.text(Math.round(14 + l.safeLeft), Math.round(12 + l.safeTop), "", {
    fontSize: `${Math.max(13, Math.round(l.fs(13)))}px`,
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
