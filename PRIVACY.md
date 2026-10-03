# Privacy

AI Chat Notes is local-first. Notes are stored in the browser's IndexedDB unless
you configure an AI provider or optional backend.

## Data sent to providers

When direct provider mode is enabled, the selected conversation transcript is sent
to the provider configured in Settings. When backend mode is enabled, the
transcript is sent to that backend, which may send it to Gemini. Review the
extraction preview before confirming generation.

## Local data

The extension may store generated Markdown, structured note fields, tags, review
metadata, source URLs, transcripts, and optional diagram screenshots. Settings let
you disable transcript retention and diagram capture. Existing transcripts can be
removed from Settings, and all local data can be deleted there.

## Self-hosted backend

The included backend stores generated results in SQLite for up to 30 days. It is
intended for private, single-instance use. Configure `BACKEND_TOKEN`,
`ALLOWED_ORIGINS`, and HTTPS before exposing it to the internet. Do not deploy it
with a publicly accessible shared token for multiple unrelated users.

This project does not provide an account system, cross-device sync service, or
centralized telemetry.
