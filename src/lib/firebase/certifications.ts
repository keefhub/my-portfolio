import { createListStore, type ListStore } from "./list";
import {
  CERTIFICATIONS_COLLECTION,
  certificationFromData,
  certificationToData,
  type CertificationContent,
} from "../admin/certifications";

export const certificationsStore: ListStore<CertificationContent> =
  createListStore<CertificationContent>(
    CERTIFICATIONS_COLLECTION,
    certificationFromData,
    certificationToData,
  );
