# LLM Wiki — Schema

This file tells the LLM how this wiki is structured, what conventions to follow, and what to do during ingestion, querying, and maintenance.

## Domain

**Domain:** pi-agy-provider — architecture, authentication, and provider internals

**Purpose:** Build a structured, compounding knowledge base of the pi-agy-provider extension's architecture decisions, authentication flows, discovered issues, and reference implementations. Survives beyond any single coding session.

**Owner:** Dung Huynh Duc

**Started:** 2026-07-03

---

## Directory Structure

```
wiki/           # LLM-generated and maintained pages
  CLAUDE.md     # This file (wiki schema)
  index.md      # Catalog of all pages (update on every ingest)
  log.md        # Append-only operation log
  overview.md   # Big-picture synthesis
  entities/     # Pages for key components, APIs, external services
  concepts/     # Pages for key ideas, patterns, design decisions
  sources/      # One summary page per ingested source
raw/            # Immutable source documents
```

---

## Page Conventions

### Cross-references

Link to other wiki pages using Obsidian-style wiki links: `[[Page Name]]`

### Contradiction notes

When a new source contradicts an existing claim, add:

```markdown
> [!NOTE] Contradiction (YYYY-MM-DD)
> Source [Source Title] (wiki/sources/source-slug.md) contradicts: [brief]. See both sources.
```

---

## Ingest Workflow

1. Read and summarize the source
2. Create source page in `wiki/sources/`
3. Update `wiki/overview.md` if big picture shifts
4. Create/update entity pages
5. Create/update concept pages
6. Check for contradictions
7. Update `wiki/index.md`
8. Append to `wiki/log.md`

---

## Style Preferences

- **Voice**: Technical, precise, evidence-backed
- **Citations**: Always cite source, link to `wiki/sources/<slug>`
- **Code references**: Use backtick paths (`src/oauth.ts:42`)
