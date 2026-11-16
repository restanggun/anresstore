# Repository governance

- Keep release changes focused and commit them from a reviewed branch.
- Require CI to pass before merging changes to the release branch.
- Keep credentials, customer records, database exports, build caches, and local archives out of source control.
- Coordinate schema and API changes in the same release plan. Follow the [release checklist](../operations/release-checklist.md) before deployment.
- Declare repository and third-party asset licenses explicitly before redistribution. This repository currently has no open-source license.

Suggested branch prefixes are `feat/`, `fix/`, and `docs/`. Production changes should be reviewed and released from a clean commit.
