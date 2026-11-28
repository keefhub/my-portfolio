=====================================================================
Task 1 — Add the kept read and move the five landing loaders onto it
Completed: 2026-11-28      Commit: f5f2163

Summary: src/lib/server/keptRead.ts wraps a read in unstable_cache keyed and tagged by a hash of the database setting; the five landing loaders read through it. Between this task and Task 2, Publish does not refresh the landing reads (expected, stated in the Step).
Decisions: build-without-setting case returns the fallback through a stub; the empty setting hashes as "".
Deviations: None.
Files changed: src/lib/server/keptRead.ts (created); src/lib/server/publicProfile.ts, publicExperience.ts, publicTechStack.ts, publicProjects.ts, publicCertifications.ts (modified)
E2E tests written: None.      Passed before the change: None.
Manual checks pending: None.

Attempts: 1
Auto-revisions: None.
Mechanical gate: PASS (warnings: none)
Tier: low
Review: none (low tier)
Findings: None.
=====================================================================
