import { createListStore, type ListStore } from "./list";
import {
  TECH_COLLECTION,
  techFromData,
  techToData,
  type TechCategoryContent,
} from "../admin/techstack";

export const techStore: ListStore<TechCategoryContent> = createListStore<TechCategoryContent>(
  TECH_COLLECTION,
  techFromData,
  techToData,
);
