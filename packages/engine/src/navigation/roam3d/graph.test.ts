import { expect, test } from "bun:test";
import { createRoamNavigator3D, type RoamWaypoint3D } from "./graph.ts";

const waypoints: RoamWaypoint3D[] = [
  { id: "start", position: [0, 0, 0] }, { id: "left", position: [-1, 0, 1] },
  { id: "right", position: [1, 0, 1] }, { id: "goal", position: [0, 2, 2] },
];
const links = [
  { id: "a", from: "start", to: "left", cost: 1 },
  { id: "b", from: "start", to: "right", cost: 1 },
  { id: "c", from: "left", to: "goal", cost: 1, traversal: "jump" },
  { id: "d", from: "right", to: "goal", cost: 1, traversal: "jump" },
];

test("routing is deterministic across authoring order and requires off-mesh capability", () => {
  const navigator = createRoamNavigator3D({ waypoints, links });
  expect(navigator.route({ from: "start", to: "goal" }).status).toBe("unreachable");
  const request = { from: "start", to: "goal", traversals: ["walk", "jump"] };
  const route = navigator.route(request);
  expect(route).toEqual(createRoamNavigator3D({ waypoints: [...waypoints].reverse(), links: [...links].reverse() }).route(request));
  expect(route.status === "found" && route.steps.map((step) => step.waypoint)).toEqual(["left", "goal"]);
  const diverted = navigator.route({ ...request, blockedLinks: ["c"] });
  expect(diverted.status === "found" && diverted.steps.map((step) => step.waypoint)).toEqual(["right", "goal"]);
});

test("search budgets, path limits, and directed links fail explicitly", () => {
  const request = { from: "start", to: "goal", traversals: ["walk", "jump"] };
  expect(createRoamNavigator3D({ waypoints, links, maxVisited: 1 }).route(request).status).toBe("budget-exceeded");
  expect(createRoamNavigator3D({ waypoints, links, maxPathLength: 1 }).route(request).status).toBe("path-too-long");
  const oneWay = createRoamNavigator3D({ waypoints, links: [{ id: "one", from: "start", to: "goal", bidirectional: false }] });
  expect(oneWay.route({ from: "goal", to: "start" }).status).toBe("unreachable");
  expect(() => createRoamNavigator3D({ waypoints, links: [{ id: "bad", from: "missing", to: "goal" }] })).toThrow("Unknown endpoint");
  expect(() => createRoamNavigator3D({ waypoints, links: [{ id: "bad", from: "start", to: "goal", cost: -1 }] })).toThrow("Invalid cost");
});
