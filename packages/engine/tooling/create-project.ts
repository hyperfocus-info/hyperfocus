/** Patch-stable public entrypoint; packaged consumers resolve the bundled implementation. */
export {
  PROJECT_STARTERS,
  PROJECT_STARTER_DESCRIPTIONS,
  createProjectStarter,
  inspectProjectStarter,
  createStarterProject,
  projectCliHelp,
  runProjectCli,
  type ProjectStarter,
  type CreateProjectStarterOptions,
  type CreatedProjectStarter,
  type ProjectStarterInspection,
} from '#project-starter';
