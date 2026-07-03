# pi-agy-provider

> [!WARNING]
> **Work in Progress — Proof of Concept**
>
> This extension is under active development. The agy OAuth auto-detection
> and token refresh have known issues on some setups. For a stable
> Antigravity OAuth experience with Gemini 3 models, Claude, and GPT-OSS,
> use below extension:
>
> ```sh
> pi install npm:@yofriadi/pi-antigravity-oauth
> ```
>
> That extension performs a full PKCE OAuth dance with proper refresh token
> support and provides access to 16+ models including Gemini 3.5 Flash,
> Claude Opus/Sonnet, and GPT-OSS.

[![npm](https://img.shields.io/npm/v/pi-agy-provider)](https://www.npmjs.com/package/pi-agy-provider)
[![npm downloads](https://img.shields.io/npm/dm/pi-agy-provider)](https://www.npmjs.com/package/pi-agy-provider)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/jellydn/pi-agy-provider/workflows/CI/badge.svg)](https://github.com/jellydn/pi-agy-provider/actions)

**pi provider for [Google Antigravity](https://antigravity.google)** — run Gemini models in [pi](https://github.com/earendil-works/pi) using your existing `agy` CLI login or a Gemini API key.

This extension registers provider `agy` and connects pi to Google's OpenAI-compatible Gemini endpoint. If you already use the Antigravity CLI (`agy`), pi picks up your OAuth token automatically — no duplicate sign-in.

## Why use this

- **Same credentials as Antigravity** — reuses `agy` OAuth from `~/.gemini/`
- **Full pi integration** — streaming, tool calls, usage tracking via `openai-completions`
- **Flexible auth** — `agy` OAuth, `GEMINI_API_KEY`, or `pi /login`
- **Live model list** — fetches models from the API at startup, with a static fallback

## Quick start

```sh
# Install
pi install npm:pi-agy-provider

# Run (OAuth if agy is already logged in, otherwise set GEMINI_API_KEY)
pi --model agy/gemini-3.5-flash -p "Explain async/await in JavaScript"
```

**Requirements:** [pi](https://github.com/earendil-works/pi) and either:

1. [agy CLI](https://antigravity.google) signed in with your Google account, or
2. A [Gemini API key](https://aistudio.google.com/apikey) from Google AI Studio

## Installation

```sh
# npm registry (recommended)
pi install npm:pi-agy-provider

# git
pi install git:github.com/jellydn/pi-agy-provider

# local path
pi install /path/to/pi-agy-provider
```

As an npm package (requires peer deps `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent`):

```sh
npm install pi-agy-provider
```

Quick test without installing:

```sh
pi -e /path/to/pi-agy-provider --model agy/gemini-3.5-flash
```

## Authentication

Credentials are resolved in this order:

| Priority | Source                   | Notes                                                                                  |
| :------- | :----------------------- | :------------------------------------------------------------------------------------- |
| 1        | `GEMINI_API_KEY` env var | Long-lived; best for extended sessions                                                 |
| 2        | `GOOGLE_API_KEY` env var | Alternate env name used by some Google SDKs                                            |
| 3        | agy OAuth token          | From macOS Keychain (`security find-generic-password -s "gemini"`). Refresh supported. |
| 4        | `~/.pi/agent/auth.json`  | pi-stored key or OAuth object                                                          |

### Option A: agy CLI (experimental)

If you use [Google Antigravity](https://antigravity.google), sign in once with the `agy` CLI. This extension reads that token from the macOS Keychain automatically.

```sh
agy   # sign in if you haven't already
pi /login   # select "Google Gemini (agy)" — auto-detects Keychain token
```

> **Note:** agy OAuth token refresh requires the Antigravity OAuth client
> credentials to be correctly configured. If auto-login doesn't work, use
> Option B or the recommended `@yofriadi/pi-antigravity-oauth` extension.

### Option B: Static API key (recommended for this provider)

```sh
export GEMINI_API_KEY="your_key_here"   # from aistudio.google.com/apikey
```

Or run `pi /login` → **Google Gemini (agy)**. If no agy login is found, it opens Google AI Studio and prompts you to paste a key.

> **Note:** agy OAuth token refresh requires the Antigravity OAuth client
> credentials (`ANTIGRAVITY_CLIENT_ID`). If auto-login doesn't work, use a
> static API key or the recommended `@yofriadi/pi-antigravity-oauth` extension.

## Usage

```sh
# Non-interactive
pi --model agy/gemini-3.5-flash -p "Summarize this repo"

# Interactive
pi --model agy/gemini-3.1-pro-preview

# List models
pi --list-models agy

# In another project
cd my-project
pi --model agy/gemini-3.5-flash --trust "Refactor the auth module"
```

Switch models in-session: `/model agy/gemini-3.5-flash`

## Supported models

| Model            | Model ID                 | Context | Max output |
| :--------------- | :----------------------- | :------ | :--------- |
| Gemini 3.5 Flash | `gemini-3.5-flash`       | 1M      | 65,536     |
| Gemini 3.1 Pro   | `gemini-3.1-pro-preview` | 1M      | 65,536     |

Model IDs match the Gemini API. In pi, prefix with `agy/` (e.g. `agy/gemini-3.5-flash`).

## Configuration

| Variable          | Default                                                   | Purpose                   |
| :---------------- | :-------------------------------------------------------- | :------------------------ |
| `GEMINI_API_KEY`  | —                                                         | Primary API key           |
| `GOOGLE_API_KEY`  | —                                                         | Alternate API key env var |
| `GEMINI_API_BASE` | `https://generativelanguage.googleapis.com/v1beta/openai` | Override API endpoint     |

Pricing for usage tracking follows [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Development

```sh
npm install
npm test              # unit tests (Vitest)
npm run test:e2e      # smoke test (needs GEMINI_API_KEY + pi)
npm run lint
npm run typecheck
prek install          # pre-commit hooks
```

## License

MIT — see [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

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
