# Last Z Command Center Architecture

## Core Platform

- `auth`
  Session management, permission checks, account lifecycle, and role enforcement.
- `data`
  Prisma models, cached read helpers, validation, and cache invalidation.
- `ai`
  Centralized vision prompt registry, provider orchestration, and AI telemetry.
- `observability`
  Performance logging, AI call logging, and server-action error reporting.

## Feature Modules

### Roster / Profiles

- Data model: `Player`, `Snapshot`
- API/actions: `savePlayer`, profile reads
- UI: roster, profile, OCR uploader
- AI/OCR: structured profile parsing, vision name extraction

### Alliance Duel

- Data model: `AllianceDuelScore`, `AllianceDuelRequirement`
- API/actions: duel score saves, screenshot parsing, requirement saves
- UI: duel maintenance and review
- AI/OCR: duel screenshot extraction through the shared AI orchestrator

### Recruitment

- Data model: `Applicant`, `MigrationCandidate`, `RecruitmentScoringConfig`
- API/actions: create/edit/import/export, scoring-config persistence
- UI: applicants, migration candidates, scoring engine
- AI/OCR: screenshot-to-draft intake using structured OCR

### Admin / Users

- Data model: `User`, `Role`, `Session`
- API/actions: account creation, reset, disable, delete, role updates
- UI: admin control panel, account panel

### Bugs

- Data model: `BugReport`
- API/actions: create/update bug reports
- UI: bug intake and review views

## Module Boundaries

- Core platform code must not import feature UI components.
- AI provider calls belong in `src/utils/ai/*`, not directly inside feature components.
- Validation and sanitization belong in shared utilities and are reused by server actions.
- Feature actions should orchestrate permission checks + persistence, while parsing/provider logic lives in dedicated utilities.

## Current AI Pattern

- Prompt definitions are versioned in `src/utils/ai/prompts.ts`
- Vision provider routing lives in `src/utils/ai/vision.ts`
- Feature modules call the orchestrator instead of calling Gemini/Hugging Face directly
- AI logs use prompt id/version + provider/model, not raw image payloads
