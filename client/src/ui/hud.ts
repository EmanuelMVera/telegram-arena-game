import type { PlayerData } from "../types/player";

export function createHud(scene: Phaser.Scene) {
  const hudText = scene.add.text(12, 12, "", {
    fontSize: "14px",
    color: "#ffffff",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    padding: {
      x: 8,
      y: 6,
    },
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
  const playerList = Object.values(players);

  if (playerList.length === 0) {
    hudText.setText("");
    return;
  }

  const lines = playerList.map((player, index) => {
    const isMe = player.id === localPlayerId;
    const name = isMe ? `P${index + 1} (Tú)` : `P${index + 1}`;

    return `${name}  HP:${player.hp ?? 100}  K:${player.kills ?? 0}  D:${
      player.deaths ?? 0
    }`;
  });

  hudText.setText(lines.join("\n"));
}
