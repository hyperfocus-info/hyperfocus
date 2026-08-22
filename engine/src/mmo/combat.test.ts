import { expect, test } from "bun:test";
import { createMmoCombatModule } from "./index.ts";

test("combat module blocks damage mitigates hits and fires kill callback once", () => {
  const events: string[] = [];
  const combat = createMmoCombatModule<{ id: string }, { hp: number; armor: number }>({
    canDamage: ({ attacker }) => attacker.id !== "blocked",
    mitigate: ({ amount, target }) => amount - target.armor,
    onHit: ({ amount, hpAfter }) => events.push(`hit:${amount}:${hpAfter}`),
    onKilled: ({ target }) => events.push(`killed:${target.hp}`)
  });
  const target = { hp: 5, armor: 2 };

  expect(combat.damage({ id: "blocked" }, target, 10)).toEqual({
    ok: false,
    blocked: true,
    killed: false,
    amount: 0,
    hpBefore: 5,
    hpAfter: 5,
    reason: "blocked"
  });
  expect(target.hp).toBe(5);
  expect(events).toEqual([]);

  expect(combat.damage({ id: "ok" }, target, 3)).toEqual({ ok: true, blocked: false, killed: false, amount: 1, hpBefore: 5, hpAfter: 4 });
  expect(combat.damage({ id: "ok" }, target, 10)).toEqual({ ok: true, blocked: false, killed: true, amount: 8, hpBefore: 4, hpAfter: 0 });
  expect(combat.damage({ id: "ok" }, target, 10)).toEqual({
    ok: false,
    blocked: true,
    killed: false,
    amount: 0,
    hpBefore: 0,
    hpAfter: 0,
    reason: "already-killed"
  });
  expect(events).toEqual(["hit:1:4", "hit:8:0", "killed:0"]);
});
