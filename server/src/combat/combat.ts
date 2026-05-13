import {
  ATTACK_COOLDOWN,
  ATTACK_DAMAGE,
  ATTACK_HEIGHT,
  ATTACK_RANGE,
} from "../config/constants";
import { getPlayers, resetPlayerAfterDeath } from "../state/players";
import type { Player } from "../types/player";

export type AttackResult = {
  valid: boolean;
  hitTargets: Player[];
  killedTargets: Player[];
};

export function processAttack(attacker: Player): AttackResult {
  const now = Date.now();

  if (now - attacker.lastAttackAt < ATTACK_COOLDOWN) {
    return {
      valid: false,
      hitTargets: [],
      killedTargets: [],
    };
  }

  attacker.lastAttackAt = now;

  const hitTargets: Player[] = [];
  const killedTargets: Player[] = [];

  const pool = attacker.roomId
    ? Object.values(getPlayers()).filter((p) => p.roomId === attacker.roomId)
    : Object.values(getPlayers());

  pool.forEach((target) => {
    if (target.id === attacker.id) return;
    if (target.hp <= 0) return;

    const horizontalDistance =
      attacker.direction === "right"
        ? target.x - attacker.x
        : attacker.x - target.x;

    const verticalDistance = Math.abs(target.y - attacker.y);

    const isInFront = horizontalDistance > 0;
    const isInRange = horizontalDistance <= ATTACK_RANGE;
    const isSameHeight = verticalDistance <= ATTACK_HEIGHT;

    if (!isInFront || !isInRange || !isSameHeight) {
      return;
    }

    target.hp -= ATTACK_DAMAGE;
    hitTargets.push(target);

    if (target.hp <= 0) {
      attacker.kills += 1;
      target.deaths += 1;

      killedTargets.push(target);
      resetPlayerAfterDeath(target);
    }
  });

  return {
    valid: true,
    hitTargets,
    killedTargets,
  };
}
