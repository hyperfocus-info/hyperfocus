import { describe, expect, test } from "bun:test";
import { createEditorCommandSession } from "../editor-command-session.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";
import {
  EDITOR_MODE_IDS,
  EDITOR_WORKSPACE_IDS,
  createEditorSessionController,
  isEditorModeId,
  isEditorWorkspaceId,
} from "./editor-session.ts";

describe("editor session controller", () => {
  test("keeps transient application state outside project history", async () => {
    const commands = createEditorCommandSession(createDefaultProject("Session boundary"));
    const controller = createEditorSessionController({ commands });
    const initialProject = controller.getSnapshot().project;
    const snapshots = [controller.getSnapshot()];
    const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot));

    expect(snapshots).toHaveLength(2);
    expect(controller.getSnapshot().session).toEqual({
      mode: "edit",
      workspace: "stage",
      selection: { kind: "none" },
      overlay: { kind: "none" },
      consoleOpen: false,
    });

    await controller.dispatch({ type: "mode.set", mode: "profile" });
    await controller.dispatch({ type: "workspace.open", workspace: "diagnostics" });
    await controller.dispatch({ type: "overlay.set", overlay: { kind: "project-center", tab: "settings" } });
    await controller.dispatch({ type: "console.toggle" });
    expect(await controller.dispatch({ type: "console.set-open", open: true })).toEqual({ kind: "session", changed: false });
    expect(await controller.dispatch({ type: "project.mark-saved" })).toEqual({ kind: "project-saved", changed: false });

    const current = controller.getSnapshot();
    expect(current.session).toMatchObject({ mode: "profile", workspace: "diagnostics", consoleOpen: true });
    expect(current.session.overlay).toEqual({ kind: "project-center", tab: "settings" });
    expect(current.project).toBe(initialProject);
    expect(commands.dirty).toBe(false);
    expect(commands.canUndo).toBe(false);
    expect(snapshots).toHaveLength(6);

    unsubscribe();
    controller.destroy();
  });

  test("represents the current resource selections without exposing caller-owned arrays", async () => {
    const controller = createEditorSessionController({ commands: createEditorCommandSession(createDefaultProject()) });
    const entityIds = ["player-01", "crate-01"];

    await controller.dispatch({
      type: "selection.set",
      selection: { kind: "entity", sceneId: "scene-main", primaryEntityId: "player-01", entityIds },
    });
    entityIds.push("sentinel-a");

    const selection = controller.getSnapshot().session.selection;
    expect(selection).toEqual({
      kind: "entity",
      sceneId: "scene-main",
      primaryEntityId: "player-01",
      entityIds: ["player-01", "crate-01"],
    });
    expect(Object.isFrozen(selection)).toBe(true);
    expect(selection.kind === "entity" && Object.isFrozen(selection.entityIds)).toBe(true);

    const noChange = await controller.dispatch({
      type: "selection.set",
      selection: { kind: "entity", sceneId: "scene-main", primaryEntityId: "player-01", entityIds: ["player-01", "crate-01"] },
    });
    expect(noChange).toEqual({ kind: "session", changed: false });

    await controller.dispatch({ type: "selection.clear" });
    expect(controller.getSnapshot().session.selection).toEqual({ kind: "none" });
    controller.destroy();
  });

  test("delegates command plans and history actions to the project authority", async () => {
    const commands = createEditorCommandSession(createDefaultProject("Before"));
    const controller = createEditorSessionController({
      commands,
      initial: { workspace: "script", selection: { kind: "script", path: "src/player.ts" } },
    });
    let notifications = 0;
    const unsubscribe = controller.subscribe(() => { notifications += 1; });

    const executed = await controller.dispatch({
      type: "project.execute",
      plan: {
        requestId: "rename-project",
        intent: "Exercise the editor application command seam",
        commands: [{
          type: "project.patch",
          label: "Rename project",
          operations: [{ op: "replace", path: "/name", value: "After" }],
        }],
      },
    });

    expect(executed.kind === "project-executed" && executed.handoff.ok).toBe(true);
    expect(controller.getSnapshot().project.project.name).toBe("After");
    expect(controller.getSnapshot().session.workspace).toBe("script");
    expect(controller.getSnapshot().session.selection).toEqual({ kind: "script", path: "src/player.ts" });
    expect(notifications).toBe(2);

    expect(await controller.dispatch({ type: "history.undo" })).toEqual({ kind: "history", changed: true });
    expect(controller.getSnapshot().project.project.name).toBe("Before");
    expect(await controller.dispatch({ type: "history.redo" })).toEqual({ kind: "history", changed: true });
    expect(controller.getSnapshot().project.project.name).toBe("After");
    expect(await controller.dispatch({ type: "project.mark-saved" })).toEqual({ kind: "project-saved", changed: true });
    expect(controller.getSnapshot().project.dirty).toBe(false);

    unsubscribe();
    controller.destroy();
  });

  test("observes project changes made through the shared command session", () => {
    const commands = createEditorCommandSession(createDefaultProject("Initial"));
    const controller = createEditorSessionController({ commands });
    const revisions: number[] = [];
    const unsubscribe = controller.subscribe((snapshot) => revisions.push(snapshot.project.revision));

    commands.transact("Rename outside the UI store", (project) => { project.name = "External"; });

    expect(controller.getSnapshot().project.project.name).toBe("External");
    expect(revisions).toEqual([0, 1]);
    unsubscribe();
    controller.destroy();
  });

  test("exports stable mode and workspace contracts for legacy adapters", () => {
    expect(EDITOR_MODE_IDS).toEqual(["edit", "play", "profile", "build"]);
    expect(EDITOR_WORKSPACE_IDS).toEqual(["stage", "scene3d", "tilemap", "atlas", "script", "post", "motion", "diagnostics"]);
    expect(isEditorModeId("play")).toBe(true);
    expect(isEditorModeId("preview")).toBe(false);
    expect(isEditorWorkspaceId("motion")).toBe(true);
    expect(isEditorWorkspaceId("network")).toBe(false);
  });

  test("disconnects listeners and rejects new work after disposal", async () => {
    const commands = createEditorCommandSession(createDefaultProject());
    const controller = createEditorSessionController({ commands });
    let notifications = 0;
    controller.subscribe(() => { notifications += 1; });
    expect(controller.destroy).toBe(controller.dispose);
    controller.dispose();

    commands.transact("Rename after teardown", (project) => { project.name = "Detached"; });
    expect(notifications).toBe(1);
    await expect(controller.dispatch({ type: "workspace.open", workspace: "atlas" })).rejects.toThrow("destroyed");
    expect(() => controller.subscribe(() => undefined)).toThrow("destroyed");
  });
});
