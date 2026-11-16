/** Utility rules over perceived, reachable opportunities; not a model of sentience. */
export type ActorAction = "idle" | "drink" | "flee" | "assist";
export type ActorOpportunity = { action: ActorAction; id: string; cell: number; cost: number; safety: number };
export type ActorChoice = ActorOpportunity & { score: number; reason: string };

export function chooseActorAction(options: {
  thirst: number; danger: number; helping: number; preservation: number;
  opportunities: readonly ActorOpportunity[];
  current?: ActorChoice; committed: boolean; hysteresis: number;
  tie: (id: string) => number;
}): ActorChoice {
  const choices = options.opportunities.map(op => {
    const value = op.action === "flee" ? options.danger * options.preservation * (1 + op.safety)
      : op.action === "assist" ? options.helping * (1 + options.danger) - options.danger * options.preservation * 0.5
      : op.action === "drink" ? options.thirst * 1.5 - options.danger * options.preservation : 0;
    return { ...op, score: value - op.cost * 0.015, reason: `${op.action}:thirst=${options.thirst.toFixed(3)},danger=${options.danger.toFixed(3)},route=${op.cost}` };
  });
  choices.sort((a, b) => b.score - a.score || options.tie(a.id) - options.tie(b.id)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.cell - b.cell
    || (a.action < b.action ? -1 : a.action > b.action ? 1 : 0));
  const best = choices[0] ?? { action: "idle" as const, id: "idle", cell: -1, cost: 0, safety: 0, score: 0, reason: "no-reachable-opportunity" };
  const retained = choices.find(c => c.id === options.current?.id && c.action === options.current.action && c.cell === options.current.cell);
  // Immediate danger may interrupt drinking, even during minimum commitment.
  if (retained && !(retained.action === "drink" && options.danger > 0.7)
    && (options.committed || best.score <= retained.score + options.hysteresis)) return { ...retained, reason: `retained:${retained.reason}` };
  return best;
}
