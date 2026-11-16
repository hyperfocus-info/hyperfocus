import { createContext, useContext } from "solid-js";
import type { ProjectSidebarController } from "../project-sidebar";

const ProjectSidebarContext = createContext<ProjectSidebarController>();
export const ProjectSidebarProvider = ProjectSidebarContext.Provider;
export function useProjectSidebar() {
  const sidebar = useContext(ProjectSidebarContext);
  if (!sidebar) throw new Error("ProjectSidebar requires its panel provider.");
  return sidebar;
}
