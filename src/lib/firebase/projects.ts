import { createListStore, type ListStore } from "./list";
import {
  PROJECTS_COLLECTION,
  projectFromData,
  projectToData,
  type ProjectContent,
} from "../admin/projects";

export const projectsStore: ListStore<ProjectContent> = createListStore<ProjectContent>(
  PROJECTS_COLLECTION,
  projectFromData,
  projectToData,
);
