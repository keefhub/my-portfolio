import { createListStore, type ListStore } from "./list";
import {
  EXPERIENCE_COLLECTION,
  experienceFromData,
  experienceToData,
  type ExperienceContent,
} from "../admin/experience";

export const experienceStore: ListStore<ExperienceContent> = createListStore<ExperienceContent>(
  EXPERIENCE_COLLECTION,
  experienceFromData,
  experienceToData,
);
