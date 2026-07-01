# CONTEXT.md — Domain Glossary

This document defines the ubiquitous language for the `pi-agy-provider` project.

---

## Core Concepts

### agy (Antigravity CLI)

Google's official AI coding agent CLI (v1.0.14). Written in Go. Provides access to Gemini and other models through Google's backend. Config stored at `~/.gemini/antigravity-cli/`.

### Google Gemini API

Google's LLM API exposing Gemini models (3.5 Flash, 3.1 Pro). Supports an OpenAI-compatible endpoint at `https://generativelanguage.googleapis.com/v1beta/openai/`.

### pi Extension

A TypeScript module loaded by the pi coding agent that registers a model provider, OAuth hooks, and error handlers.

### Provider

The model provider registered with pi as `"agy"`. Models are referenced as `agy/<model-id>` (e.g., `agy/gemini-3.5-flash`).

---

## Authentication

### Static API Key

A long-lived API key from Google AI Studio (`aistudio.google.com/apikey`). Used directly as the `Authorization: Bearer <key>` header.

### agy OAuth Token

A short-lived (~1 hour) OAuth access token stored by the agy CLI at `~/.gemini/antigravity-cli/antigravity-oauth-token` or `~/.gemini/oauth_creds.json`. Cannot be refreshed without re-running the agy CLI.

### Credential Store

JSON files that store credentials:
- **agy CLI store**: `~/.gemini/antigravity-cli/antigravity-oauth-token` (bare token), `~/.gemini/oauth_creds.json` (JSON with `access_token`)
- **pi auth store**: `~/.pi/agent/auth.json` — `agy` (string) or `agy.access` (OAuth object)

---

## Model Lifecycle

### Static Model Catalog

Two hardcoded models: Gemini 3.5 Flash and Gemini 3.1 Pro Preview, with pricing, context windows (1M tokens), and token limits (65,536 output).

### Dynamic Model Discovery

Runtime fetch from Gemini's `/models` endpoint (OpenAI-compatible format). Only `gemini-` prefixed models are included. Falls back to static catalog on error.

---

## Error Handling

### Error Classification

Three categories:
- **Invalid key** (401, unauthorized) — credentials need refresh
- **Rate limited** (429) — temporary throttle
- **Quota exceeded** (403, forbidden) — usage limit reached

### Error Pipeline

Filter → Classify → Deliver via `message_end` event handler.
