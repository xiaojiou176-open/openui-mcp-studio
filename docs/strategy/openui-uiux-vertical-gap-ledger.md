# OpenUI UI/UX Vertical Gap Ledger

> Current Wave 3 + 4 ledger for UI/UX vertical hardening.
> This document builds on the landed Round 2 foundation.
> It does not reopen Round 2 closure, and it does not promote later lanes into current truth.

## 1. Why This Exists

Round 2 already proved that OpenUI MCP Studio is more than a prompt-to-files repo.
The current wave is narrower:

1. keep the UI/UX audit engine honest
2. make its structured output easier to consume
3. reflect that stronger vertical story on the proof and operator surfaces

In plain language:
the audit brain already existed; this wave makes it easier for a human or builder to understand what the brain has actually concluded.

## 2. Current Strengths

These are already real current-scope truths:

- `openui_review_uiux` returns both `review` and a structured `audit` frame
- workspace audit already produces category rollups, hotspot paths, and ranked next steps
- style packs and rubrics are now explicit contract inputs instead of being implied visual taste only
- `/proof` already behaves like a proof desk and `/workbench` already behaves like an operator desk

## 3. This Wave Hardening

### 3.1 Audit Contract

The shared audit contract is now thicker:

- `stylePack.contract`
  - exposes `tokenMode`, `hierarchyRule`, `primaryActionRule`, and the rubric itself
- `automatedSignals`
  - explains what the audit already concluded automatically
- `manualReview`
  - explains where a human call is still required
- `nextOperatorMove`
  - turns the first ranked next step into a clearer handoff signal

That means the audit packet is now easier to read as:

1. what the system saw
2. what still needs a reviewer
3. what the operator should do next

### 3.2 Proof Surface

`/proof` is now intentionally clearer on first read:

- a `Proof contract` card explains audience, proof scope, and non-proof scope
- the middle band reads more like a three-way routing surface than a loose stack of explanation cards
- `Proof packet anatomy` separates the shortest flow from the evidence bundle it leaves behind
- a visible `Not proved here` strip stops the desk from overclaiming

### 3.3 Operator Surface

`/workbench` is now intentionally clearer as a repo-local operator desk:

- a `Desk status strip` explains that the surface is still repo-local and simulated
- a `Lane contract and honesty notes` section makes each lane easier to read without guessing
- the surface keeps proof meaning one click away instead of pretending the workbench itself is the proof manual

## 4. Still Partial

These are real carry-forward gaps, not current claims:

- proof and workbench still do not consume live `UiuxAuditFrame` artifacts end-to-end
- the operator desk still uses repo-local simulated work items rather than a live operations data plane
- workspace hotspots and next-step guidance are stronger, but they are still more visible in audit output than in app-level review packets
- style packs remain audit framing and review contracts, not runtime theme switching promises

## 5. Honest Boundary

Current UI/UX vertical truth is still bounded:

- this is not an autonomous design judge
- this is not an auto-remediation engine
- this does not replace release judgment, Git landing, or final design sign-off
- visual QA and rubric logic are still adjacent lanes, not one fully fused product packet yet

## 6. Later Lanes Do Not Touch

The following remain later lanes:

- formal public Skills productization
- plugin or marketplace packaging
- SDK packaging
- hosted API packaging
- remote write-capable MCP
- any claim that the operator desk is a live ops console

## 7. Reading Rule

When you need the current UI/UX vertical truth, read these together:

- [`docs/strategy/openui-uiux-truth-ledger.md`](./openui-uiux-truth-ledger.md)
- [`docs/architecture/uiux-engine-round1.md`](../architecture/uiux-engine-round1.md)
- `services/mcp-server/src/uiux/audit-foundation.ts`
- `tooling/uiux-ai-audit.ts`
- `/proof`
- `/workbench`
