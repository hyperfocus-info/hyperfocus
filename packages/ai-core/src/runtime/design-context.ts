const contextMarker = "Interface guidance for this task:";

/** A small task router, not a stack selector. Project instructions still take precedence. */
export function aiDesignGuidanceForTask(options: { task: string; projectContext?: string }): string {
  if (options.task.includes(contextMarker)) return "";
  const task = options.task.normalize("NFKC").replace(/\b(?:audio|midi|network|programming) interfaces?\b/gi, "");
  // An explicitly excluded interface is not evidence for adding interface context.
  const positive = task.replace(/\b(?:no|without|exclude|skip|do not (?:build|change|add)|don't (?:build|change|add))\s+(?:(?:a|an|the|any)\s+)?(?:ui|user interface|frontend|front end|dashboard|website|web app|(?:game |pause |title |main )?menus?|(?:interactive |in-app |in-game )?tutorials?|onboarding)\b[^.;\n]*/gi, "");
  const compositionTask = positive.replace(/\b(?:write|translate|summarize)\s+(?:(?:a|an|the)\s+)?(?:tutorial|guide|documentation)\b[^.;\n]*/gi, "");
  const gameMenu = /\b(?:game menus?|menu system|(?:title|main|pause|mode selection) menus?|(?:rewards?|results?|character select) screens?)\b/i.test(compositionTask);
  const tutorial = /\b(?:(?:interactive|in[- ]app|in[- ]game|first[- ]fight) (?:tutorials?|onboarding)|tutorial (?:ui|flow|screen|system|coach|overlay|composition)|onboarding (?:flow|screen))\b|\b(?:tutorials?|onboarding)\b[^.;\n]{0,60}\b(?:game|app|timing|completion|feedback)\b|\b(?:game|app)\b[^.;\n]{0,60}\btutorials?\b/i.test(compositionTask);
  const interfaceIntent = /\b(?:ui|user interface|website|webpage|landing page|web app|dashboard|toolbar|inspector|dialog|typography|responsive (?:layout|screen|page)|form layout|button styling)\b/i.test(compositionTask);
  const appIntent = /\b(?:build|create|make|design|develop|want|need)\s+(?:(?:me|us)\s+)?(?:(?:a|an|the)\s+)?(?:[\w-]+\s+){0,8}(?:app|application)\b/i.test(compositionTask)
    || /\b(?:crea|crear|construye|desarrolla)\s+(?:una?\s+)?(?:app|aplicaci[oó]n)\b|\b(?:cr[eé]e|cr[eé]er|construis)\s+(?:une?\s+)?(?:app|application)\b|\b(?:erstelle|baue|entwickle)\s+(?:eine?\s+)?(?:app|anwendung)\b/iu.test(compositionTask);
  const nonvisual = /\b(?:cli|command[- ]line|backend[- ]only|back[- ]end[- ]only|api[- ]only|headless|server[- ]only)\b|\b(?:api|backend|server)\s+(?:app|application|service)\b|\b(?:tutorial|menu) (?:completion |progress )?(?:api|schema|protocol)\b/i.test(compositionTask);
  const explicitVisualCompanion = /\b(?:and|also|plus|with)\s+(?:(?:build|create|add|make)\s+)?(?:(?:a|an|the)\s+)?(?:ui|user interface|frontend|dashboard|website|web app)\b|[.;\n]\s*(?:build|create|add|make)\s+(?:(?:a|an|the)\s+)?(?:ui|dashboard|website|web app)\b/i.test(compositionTask);
  if ((nonvisual && !explicitVisualCompanion) || (!interfaceIntent && !gameMenu && !tutorial && (!appIntent || positive !== task))) return "";
  const guidance = [
    contextMarker,
    "Honor the requested stack and visual references; reuse the project's components and approved choices. Ask about unresolved preferences that materially change the outcome.",
    "Composition: intent, surface type, canonical composition, semantic content, validation.",
    "Attention: fewest useful elements; one primary action per active view. Omit routine subtitles; keep critical state and useful hero/empty/error guidance. Disclose details; use clear named icons and pointer cursors; navbar logo/name returns home without losing drafts.",
    "Identity: replaceable logo, favicon/install assets and editable Open Graph; preserve existing identity, never invent a public origin.",
    "Interaction: unique grouped navbar actions, no subtext; Settings is a view (Meta/Ctrl+,). Common flows have shortcuts. Drawer triggers toggle; Escape closes only the newest overlay and restores focus. Inputs use normal weight; align field controls and uploads."
  ];
  if (/\b(?:forms?|sign[- ]?up|log[- ]?in|settings|preferences|checkout|validation)\b/i.test(compositionTask)) {
    guidance.push("Forms: labeled groups, inline errors, explicit save outcome; preserve drafts.");
  }
  if (/\b(?:dashboard|tables?|records?|invoices?|expenses?|inventory|data grid|lists?)\b/i.test(compositionTask)) {
    guidance.push("Data: prioritize key values/actions; choose responsive columns, scrolling or lists.");
  }
  if (/\b(?:navigation|sidebar|multi[- ]page|routes?|tabs?)\b/i.test(compositionTask)) {
    guidance.push("Navigation: retain task state and current location.");
  }
  if (/\b(?:audio|video|media|music|playback|timeline|waveform)\b/i.test(compositionTask)) {
    guidance.push("Media: visible transport/playback state; named keyboard controls.");
  }
  if (gameMenu) guidance.push("Game menus: group by player intent; bound action count and declare priority, audience and availability. One primary per decision; explain waiting. Keep developer tools separate. Preserve controller focus, Back and modal focus return.");
  if (tutorial) guidance.push("Tutorials: declare objective, steps, actual input, timing and observed success. Auto-complete from host evidence; explain mistakes and corrections. Demonstrations need pause/replay/return, restore the attempt and never earn progress. Paused/background time cannot advance success.");
  guidance.push("Verify real views at narrow widths and enlarged text: alignment, keyboard/focus, failures and bounded modal height/content. Tests are evidence, not taste approval.");
  return `\n\n${guidance.join(" ")}`;
}
