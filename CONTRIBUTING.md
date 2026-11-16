# Contributing

## Development setup

- Node.js `>=22.18` and npm `>=10` are required.
- Install dependencies with `npm ci` and configure the relevant local environment files from their `.env.example` templates.
- Read the repository README and applicable `AGENTS.md` instructions before changing code.

## Changes

- Use focused branches such as `feat/catalog`, `fix/checkout`, or `docs/deployment`.
- Keep database migrations and generated database types aligned with application changes.
- Never commit credentials, production data, build output, or local environment files.
- Describe behavior changes, migration impact, and operational considerations in the pull request.

## Validation

Run the relevant checks before submitting a change:

```sh
npm run typecheck
npm test
npm run test:web
npm run test:db
npm run build
```

Provider transactions and VPS deployment require separate staging verification; automated tests do not replace those checks.

## Licensing

No open-source license has been declared for this repository. Please contact the project owner before redistributing code or assets.
