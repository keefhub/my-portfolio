import { expect, test } from "@playwright/test";
import { isEmulatorHost } from "../src/lib/firebase/config";
import { accessFor } from "../src/lib/admin/owner";

test("E2E-18: isEmulatorHost is true only for 127.0.0.1 and localhost", () => {
  expect(isEmulatorHost("127.0.0.1")).toBe(true);
  expect(isEmulatorHost("localhost")).toBe(true);
  expect(isEmulatorHost("admin.example.test")).toBe(false);
  expect(isEmulatorHost("thegoldenpothos.dev")).toBe(false);
  expect(isEmulatorHost("")).toBe(false);
});

test("E2E-19: accessFor decides unfilled, owner and not-allowed from user IDs", () => {
  expect(accessFor("a", "")).toBe("unfilled");
  expect(accessFor("a", "REPLACE_WITH_OWNER_UID")).toBe("unfilled");
  expect(accessFor("a", "a")).toBe("owner");
  expect(accessFor("a", "b")).toBe("not-allowed");
});
