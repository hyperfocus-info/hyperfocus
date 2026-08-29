export type MmoCombatDamageArgs<TAttacker, TTarget, TContext> = {
  attacker: TAttacker;
  target: TTarget;
  amount: number;
  context: TContext | undefined;
  hpBefore: number;
};

export type MmoCombatHitEvent<TAttacker, TTarget, TContext> = MmoCombatDamageArgs<TAttacker, TTarget, TContext> & {
  hpAfter: number;
  killed: boolean;
};

export type MmoCombatDamageResult =
  | {
      ok: false;
      reason: "blocked" | "already-killed";
      amount: 0;
      hpBefore: number;
      hpAfter: number;
      killed?: never;
    }
  | {
      ok: true;
      killed: boolean;
      amount: number;
      hpBefore: number;
      hpAfter: number;
      reason?: never;
    };

export type MmoCombatModuleConfig<TAttacker = unknown, TTarget extends { hp: number } = { hp: number }, TContext = unknown> = {
  getHealth?: (target: TTarget) => number;
  setHealth?: (target: TTarget, hp: number) => void;
  canDamage?: (args: MmoCombatDamageArgs<TAttacker, TTarget, TContext>) => boolean;
  mitigate?: (args: MmoCombatDamageArgs<TAttacker, TTarget, TContext>) => number;
  onHit?: (event: MmoCombatHitEvent<TAttacker, TTarget, TContext>) => void;
  onKilled?: (event: MmoCombatHitEvent<TAttacker, TTarget, TContext>) => void;
};

export type MmoCombatModule<TAttacker = unknown, TTarget extends { hp: number } = { hp: number }, TContext = unknown> = {
  damage(attacker: TAttacker, target: TTarget, amount: number, context?: TContext): MmoCombatDamageResult;
};

function finiteDamage(amount: number) {
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function createMmoCombatModule<TAttacker = unknown, TTarget extends { hp: number } = { hp: number }, TContext = unknown>(
  config: MmoCombatModuleConfig<TAttacker, TTarget, TContext> = {}
): MmoCombatModule<TAttacker, TTarget, TContext> {
  const getHealth = config.getHealth ?? ((target: TTarget) => target.hp);
  const setHealth = config.setHealth ?? ((target: TTarget, hp: number) => {
    target.hp = hp;
  });

  return {
    damage(attacker, target, rawAmount, context) {
      const hpBefore = Math.max(0, getHealth(target));
      const amount = finiteDamage(rawAmount);
      const args = { attacker, target, amount, context, hpBefore };
      if (hpBefore <= 0) return { ok: false, amount: 0, hpBefore, hpAfter: hpBefore, reason: "already-killed" };
      if (config.canDamage && !config.canDamage(args)) return { ok: false, amount: 0, hpBefore, hpAfter: hpBefore, reason: "blocked" };
      const mitigated = finiteDamage(config.mitigate ? config.mitigate(args) : amount);
      const hpAfter = Math.max(0, hpBefore - mitigated);
      const killed = hpBefore > 0 && hpAfter <= 0;
      setHealth(target, hpAfter);
      const event = { ...args, amount: mitigated, hpAfter, killed };
      config.onHit?.(event);
      if (killed) config.onKilled?.(event);
      return { ok: true, killed, amount: mitigated, hpBefore, hpAfter };
    }
  };
}
