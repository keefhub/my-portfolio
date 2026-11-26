import { expect, test } from "@playwright/test";
import {
  CERT_MESSAGES,
  CERTIFICATIONS_COLLECTION,
  certificationFromData,
  certificationLabel,
  certificationToData,
  checkCertification,
  emptyCertification,
} from "../src/lib/admin/certifications";

const NAME_MSG = "Enter a name";
const ICON_REQUIRED_MSG = "Pick an uploaded image or enter a badge image path that starts with /";
const ICON_INVALID_MSG = "Enter a badge image path that starts with /";
const URL_MSG = "Enter a link that starts with https://";

test.describe("manage-certifications", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: the check trims and accepts a good certification", () => {
    const I = {
      name: " Professional Scrum Developer ",
      icon: " /certs/scrum.png ",
      url: " https://www.credly.com/badges/example/public_url ",
    };
    const first = checkCertification(I);
    expect(first).toEqual({
      ok: true,
      content: {
        name: "Professional Scrum Developer",
        icon: "/certs/scrum.png",
        url: "https://www.credly.com/badges/example/public_url",
      },
    });
    expect(I.name).toBe(" Professional Scrum Developer ");
    expect(I.icon).toBe(" /certs/scrum.png ");
    expect(I.url).toBe(" https://www.credly.com/badges/example/public_url ");

    const second = checkCertification({
      name: "Scrum",
      icon: "http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t",
      url: "https://example.com/c",
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.content.icon).toBe("http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t");
    }

    const third = checkCertification({
      name: "Scrum",
      icon: " https://firebasestorage.googleapis.com/v0/b/x/o/images%2Fa.png?alt=media ",
      url: "https://example.com/c",
    });
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.content.icon).toBe("https://firebasestorage.googleapis.com/v0/b/x/o/images%2Fa.png?alt=media");
    }

    const fourth = checkCertification({ name: "Scrum", icon: "/certs/a.png", url: "HTTPS://Example.com/C" });
    expect(fourth.ok).toBe(true);
    if (fourth.ok) {
      expect(fourth.content.url).toBe("HTTPS://Example.com/C");
    }
  });

  test("E2E-02: the check refuses each bad field with its own message", () => {
    const B = { name: "Professional Scrum", icon: "/certs/scrum.png", url: "https://example.com/cred" };
    const results = [
      checkCertification({ ...B, name: "" }),
      checkCertification({ ...B, name: "   " }),
      checkCertification({ ...B, name: "\t\n" }),
      checkCertification({ ...B, url: "credly.com/badge" }),
      checkCertification({ ...B, url: "http://example.com/cred" }),
      checkCertification({ ...B, url: "" }),
      checkCertification({ ...B, url: "https://" }),
      checkCertification({ ...B, icon: "certs/scrum.png" }),
      checkCertification({ ...B, icon: "//cdn.example.com/a.png" }),
      checkCertification({ ...B, icon: "/" }),
      checkCertification({ ...B, icon: "ftp://x.test/a.png" }),
      checkCertification({ ...B, icon: "/certs/my badge.png" }),
      checkCertification({ ...B, icon: "" }),
      checkCertification({ ...B, icon: "   " }),
      checkCertification({ name: "", icon: "certs/x.png", url: "x" }),
      checkCertification({ ...B, name: "  Professional Scrum  " }),
    ];

    for (let i = 0; i < 3; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ name: NAME_MSG });
    }
    for (let i = 3; i < 7; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ url: URL_MSG });
    }
    for (let i = 7; i < 12; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ icon: ICON_INVALID_MSG });
    }
    for (let i = 12; i < 14; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ icon: ICON_REQUIRED_MSG });
    }
    expect(results[14].ok).toBe(false);
    expect(results[14].ok === false && results[14].errors).toEqual({
      name: NAME_MSG,
      icon: ICON_INVALID_MSG,
      url: URL_MSG,
    });
    expect(results[15]).toEqual({ ok: true, content: B });

    expect(CERT_MESSAGES.nameRequired).toBe(NAME_MSG);
    expect(CERT_MESSAGES.iconRequired).toBe(ICON_REQUIRED_MSG);
    expect(CERT_MESSAGES.iconInvalid).toBe(ICON_INVALID_MSG);
    expect(CERT_MESSAGES.urlInvalid).toBe(URL_MSG);
  });

  test("E2E-03: reading, writing and labelling stored certifications", () => {
    const a = certificationFromData({
      name: "Professional Scrum Developer",
      icon: "/certs/scrum.png",
      url: "https://www.credly.com/badges/example/public_url",
      position: 3,
      updatedAt: 5,
    });
    const blank = { name: "", icon: "", url: "" };

    expect(a).toEqual({
      name: "Professional Scrum Developer",
      icon: "/certs/scrum.png",
      url: "https://www.credly.com/badges/example/public_url",
    });
    expect(certificationFromData({})).toEqual(blank);
    expect(certificationFromData({ name: 5, icon: null, url: [] })).toEqual(blank);
    expect(certificationFromData({ name: "Only a name" })).toEqual({ ...blank, name: "Only a name" });
    expect(certificationFromData(null)).toEqual(blank);
    expect(certificationFromData("x")).toEqual(blank);

    const e1 = emptyCertification();
    const e2 = emptyCertification();
    expect(e1).toEqual(e2);
    expect(e1).not.toBe(e2);

    expect(Object.keys(certificationToData(a)).sort()).toEqual(["icon", "name", "url"]);
    expect(certificationToData(a)).toEqual({
      name: "Professional Scrum Developer",
      icon: "/certs/scrum.png",
      url: "https://www.credly.com/badges/example/public_url",
    });
    expect(certificationLabel(a)).toBe("Professional Scrum Developer");

    expect(CERT_MESSAGES.emptyList).toBe("No certifications yet.");
    expect(CERT_MESSAGES.listLabel).toBe("Certifications list");
    expect(CERT_MESSAGES.addLabel).toBe("Add certification");
    expect(CERT_MESSAGES.imagesFailed).toBe("The uploaded images could not be loaded.");
    expect(CERTIFICATIONS_COLLECTION).toBe("certifications");
  });
});
