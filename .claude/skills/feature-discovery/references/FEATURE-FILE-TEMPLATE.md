# Feature file output shape

What `/feature-discovery` Mode B Phase 4 writes to `docs/features/<slug>/story.md`. Five parts, in this
order, nothing else. The Gherkin block is byte-compatible with the existing stories in `docs/features/`;
the three trailing sections are additions this skill introduces, and `/feature-spec` reads them as
input to its Open Questions & Risks phase.

## The template

````markdown
# Export Report As CSV

```gherkin
Feature: Export a report as CSV
  As an analyst
  I want to download the report I am viewing as a CSV file
  So that I can open it in a spreadsheet without retyping the figures

  Scenario: Analyst exports the report with its current filters
    Given the analyst has filtered the sales report to "March 2026"
    And the filtered report has 42 rows
    When the analyst chooses "Export CSV"
    Then a file named "sales-report-2026-03.csv" should download
    And the file should contain 42 rows plus a header row

  Scenario: Analyst exports a report that has no rows
    Given the analyst has filtered the sales report to a month with no sales
    When the analyst chooses "Export CSV"
    Then the analyst should see "Nothing to export for this filter"
    And no file should download

  Scenario: Analyst's filters survive a page reload before exporting
    Given the analyst has filtered the sales report to "March 2026"
    When the analyst reloads the page
    Then the report should still show "March 2026"
```

## Assumptions

1. The export contains exactly the rows the report shows, in the order it shows them.
2. Amounts export as plain numbers with a separate currency column.
3. Exporting needs no sign-in beyond what viewing the report already needs (OVERVIEW §2).

## Out of Scope

- Choosing which columns the file includes
- Scheduling a recurring export
- Exporting several reports with one action

## Deferred

- Excel (.xlsx) output — deferred until someone asks for formatting the CSV cannot carry
- Exporting more than 50,000 rows — deferred, needs a background job and a download link
````

## Rules for each part

**Title** — `# Title`, Title Case, no number,
matching the `Feature:` line in meaning.

**Gherkin block** — one fence, language `gherkin`. Inside: the `Feature:` line, then the
`As a / I want / So that` three-liner at two-space indent, then a blank line before each `Scenario:`.
Two-space indent for `Scenario:`, four for its steps. Happy path first; edge-case scenarios after it,
in taxonomy order.

**Scenario names** — a statement of the case, not a label: `Customer applies a code after it has
expired`, not `Expiry edge case`. Name the situation so a failing test reads as a sentence.

**Steps** — `Given` sets state, `When` is the single user action, `Then`/`And` assert what the user
sees or what survives a refresh. No component names, hooks, file paths, libraries, CSS classes, or
database column names. Amounts carry their currency code (`USD 0.85`); identifiers are quoted
exactly as a user would type them (`"INV-1042"`). Use the interface's own words, from the design doc's
voice section if the profile names one (a button called "Export CSV" stays "Export CSV").

**One assertion cluster per scenario** — if a scenario asserts two independent outcomes, split it.
Use `Scenario Outline` + `Examples` only when behaviour varies by data alone.

**Assumptions** — numbered, one sentence each. Everything decided in the sweep that the original
requirement did not state. These are the claims `/feature-spec` will challenge, so make each one
falsifiable.

**Out of Scope** — bulleted. What a reader would reasonably expect and will not get. This is what
stops `/sdd` implementing beyond the spec.

**Deferred** — bulleted, each with its reason. Distinct from Out of Scope: deferred means "later",
out of scope means "not this feature".

**Empty sections are written as `None.`** Deleting a section makes it look unasked.
