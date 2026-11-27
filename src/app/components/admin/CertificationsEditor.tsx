"use client";

import { useEffect, useState } from "react";
import {
  CERT_MESSAGES,
  certificationLabel,
  checkCertification,
  emptyCertification,
  type CertificationContent,
} from "@/lib/admin/certifications";
import { bottomPosition } from "@/lib/admin/list";
import { photoSelection } from "@/lib/admin/profile";
import type { UploadedImage } from "@/lib/admin/images";
import { certificationsStore } from "@/lib/firebase/certifications";
import { listImages } from "@/lib/admin/imagesClient";
import ListEditor, { type ListFieldsProps } from "./ListEditor";
import {
  FieldError,
  errorStyle,
  fieldProps,
  groupStyle,
  inputStyle,
  labelStyle,
  legendStyle,
} from "./formParts";

type ImagesState = { images: UploadedImage[]; failed: boolean };

export default function CertificationsEditor(props: { savingOn: boolean }): React.JSX.Element {
  const [loaded, setLoaded] = useState<ImagesState>({ images: [], failed: false });

  useEffect(() => {
    let mounted = true;
    async function loadImages(): Promise<void> {
      let next: ImagesState;
      try {
        next = { images: await listImages(), failed: false };
      } catch {
        next = { images: [], failed: true };
      }
      if (!mounted) return;
      setLoaded(next);
    }
    void loadImages();
    return () => {
      mounted = false;
    };
  }, []);

  const { images, failed } = loaded;

  function renderFields(fields: ListFieldsProps<CertificationContent>): React.ReactNode {
    const { value, onChange, errors, disabled } = fields;
    const selection = photoSelection(value.icon, images);
    return (
      <>
        <div style={labelStyle}>
          <label htmlFor="certification-name">Name</label>
          <input
            id="certification-name"
            type="text"
            style={inputStyle}
            value={value.name}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            {...fieldProps("certification-name-error", errors.name)}
          />
          <FieldError id="certification-name-error" text={errors.name} />
        </div>
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>Badge image</legend>
          {failed && (
            <p role="alert" style={errorStyle}>
              {CERT_MESSAGES.imagesFailed}
            </p>
          )}
          <div style={labelStyle}>
            <label htmlFor="certification-uploaded-image">Uploaded image</label>
            <select
              id="certification-uploaded-image"
              style={inputStyle}
              value={selection.imageId}
              disabled={disabled}
              onChange={(e) => {
                const picked = images.find((i) => i.id === e.target.value);
                onChange({ ...value, icon: picked ? picked.url : "" });
              }}
            >
              <option value="">None</option>
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.name}
                </option>
              ))}
            </select>
          </div>
          <div style={labelStyle}>
            <label htmlFor="certification-icon-path">Badge image path</label>
            <input
              id="certification-icon-path"
              type="text"
              style={inputStyle}
              value={selection.path}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, icon: e.target.value })}
              {...fieldProps("certification-icon-error", errors.icon)}
            />
            <FieldError id="certification-icon-error" text={errors.icon} />
          </div>
        </fieldset>
        <div style={labelStyle}>
          <label htmlFor="certification-url">Credential link</label>
          <input
            id="certification-url"
            type="text"
            style={inputStyle}
            value={value.url}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            {...fieldProps("certification-url-error", errors.url)}
          />
          <FieldError id="certification-url-error" text={errors.url} />
        </div>
      </>
    );
  }

  return (
    <ListEditor<CertificationContent>
      heading="Certifications"
      savingOn={props.savingOn}
      store={certificationsStore}
      label={certificationLabel}
      emptyContent={emptyCertification}
      check={checkCertification}
      renderFields={renderFields}
      emptyText={CERT_MESSAGES.emptyList}
      listLabel={CERT_MESSAGES.listLabel}
      addLabel={CERT_MESSAGES.addLabel}
      newPosition={bottomPosition}
    />
  );
}
