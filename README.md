# pi-agy-provider 🚀

[![npm](https://img.shields.io/npm/v/pi-agy-provider)](https://www.npmjs.com/package/pi-agy-provider)
[![npm downloads](https://img.shields.io/npm/dm/pi-agy-provider)](https://www.npmjs.com/package/pi-agy-provider)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/jellydn/pi-agy-provider/workflows/CI/badge.svg)](https://github.com/jellydn/pi-agy-provider/actions)

> Google Gemini provider for [pi](https://github.com/earendil-works/pi) — access Gemini 3.5 Flash and Gemini 3.1 Pro through Google's OpenAI-compatible API, with automatic agy (Antigravity CLI) credential reuse.

This provider uses Google's **OpenAI-compatible Chat Completions API**, so no custom streaming protocol is needed — pi's built-in `openai-completions` streaming handles SSE parsing, tool calls, and usage tracking.

## 📦 Installation

### As a pi extension (recommended)

```sh
pi install npm:pi-agy-provider
# or from git
pi install git:github.com/jellydn/pi-agy-provider
# or local path
pi install /path/to/pi-agy-provider
```

### As an npm package

```sh
npm install pi-agy-provider
# or
pnpm add pi-agy-provider
```

> **Note:** This package requires `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` as peer dependencies. They are automatically available when installed as a pi extension; install them manually when using as a standalone npm dependency.

## Pre-requirements

- [pi](https://github.com/earendil-works/pi) coding agent
- A [Gemini API key](https://aistudio.google.com/apikey) from Google AI Studio, **or** the [agy CLI](https://antigravity.google) (Antigravity CLI) authenticated with your Google account

## Features

- Full streaming via Google's OpenAI-compatible `/v1beta/openai/chat/completions` endpoint
- Per-token cost tracking against Google's reference pricing
- **agy OAuth credential reuse** — automatically detects your agy CLI login; no separate API key needed
- API key auto-discovery from `GEMINI_API_KEY` / `GOOGLE_API_KEY` env vars, `~/.gemini/` files, or `~/.pi/agent/auth.json`
- **Dynamic model discovery** — fetches the live model list from the Gemini API at startup, falling back to a curated static list on error
- `/login` integration — automatic agy OAuth detection or browser-assisted manual paste

## Supported Models

| Model             | Model ID                   | Context | Max Output |
| :---------------- | :------------------------- | :------ | :--------- |
| Gemini 3.5 Flash  | `gemini-3.5-flash`         | 1M      | 65,536     |
| Gemini 3.1 Pro    | `gemini-3.1-pro-preview`   | 1M      | 65,536     |

## Authentication

This extension supports **two authentication methods**, tried in order:

### Option 1: agy CLI Login (OAuth — recommended)

If you already use the [agy CLI](https://antigravity.google) (Google's Antigravity CLI) and have authenticated with your Google account, this extension **automatically reuses your login** — no separate API key needed.

Run `pi /login` and select **Google Gemini (agy)**. The extension detects your OAuth token from `~/.gemini/antigravity-cli/antigravity-oauth-token` or `~/.gemini/oauth_creds.json` and logs you in instantly.

### Option 2: Static API Key (manual)

1. Get a Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Set the environment variable:

```sh
echo 'export GEMINI_API_KEY="your_key_here"' >> ~/.zshrc
source ~/.zshrc
```

Alternatively, run `pi /login` and select **Google Gemini (agy)** — if no agy CLI login is detected, it opens Google AI Studio and prompts you to paste a static API key.

## Usage

```sh
# Non-interactive
pi --model agy/gemini-3.5-flash -p "Explain async/await in JavaScript"

# Interactive
pi --model agy/gemini-3.1-pro-preview

# List available models
pi --list-models agy

# Use in another project
cd my-project
pi --model agy/gemini-3.5-flash --trust "Refactor the auth module"
```

Switch models in-session with `/model agy/gemini-3.5-flash`.

## Run tests

```sh
npm test
```

## Pre-commit

This project uses [prek](https://github.com/earendil-works/prek) to enforce code quality. To install hooks:

```sh
prek install
```

## Notes

- **Pricing**: Per-token costs are from [Google's Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and are used for usage tracking.
- **Context windows**: 1M tokens for both models.
- **Custom API base**: set `GEMINI_API_BASE` env var to override the endpoint (default: `https://generativelanguage.googleapis.com/v1beta/openai`).
- **agy OAuth limitations**: agy OAuth tokens are short-lived (~1 hour) and cannot be refreshed without re-running the agy CLI. For long-running sessions, use a static API key.

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Author

👤 **Huynh Duc Dung**

- Website: https://productsway.com/
- Twitter: [@jellydn](https://twitter.com/jellydn)
- Github: [@jellydn](https://github.com/jellydn)

## Show your support

Give a ⭐️ if this project helped you!

<a href="https://ko-fi.com/dunghd">
  <img src="https://img.shields.io/badge/ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="ko-fi">
</a>
<a href="https://paypal.me/dunghd">
  <img src="https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal">
</a>
<a href="https://www.buymeacoffee.com/dunghd">
  <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee">
</a>
