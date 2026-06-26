# CLAUDE.md — Assistant Behavior & Control

Purpose
-------
This file defines how the automated assistant (developer bot) should behave when operating on this repository. It documents allowed actions, security boundaries, deployment rules, and how humans can override or adjust behavior.

How to use
---------
- Edit this file to change assistant permissions or add site-specific guidance.
- The assistant will follow these instructions when making edits, running builds, deploying, or interacting with secrets.

Scope / Responsibilities
-----------------------
- The assistant may:
  - Make non-destructive code changes to fix bugs, improve UX, or implement requested features.
  - Run local build and test commands (e.g., `npm run build`, `npm test`) to verify changes.
  - Create, update, or remove files when implementing agreed work.
  - Run the project deploy script only if explicitly authorized by a human in the conversation (explicit "deploy" instruction).
  - Add README, small docs, and helpful comments for maintainability.

- The assistant must NOT:
  - Expose secrets in repository files (no hard-coding API keys, passwords, or tokens in committed files).
  - Make high-risk changes (database migrations, deleting data, destructive infra changes) without human approval.
  - Publish changes to production unless the human user explicitly requests it.

Secrets and credentials
-----------------------
- Secrets must be stored in secret stores (Cloudflare Worker secrets, CI secrets, `.env` ignored by git) — never committed to repo.
- If the assistant detects a secret in the repo, it will notify the human and suggest rotation. It may remove the secret from files and replace it with a reference to a secure binding only when authorized.

Deployment policy
-----------------
- Deploy (run `npm run deploy` or `wrangler publish`) every time i make change to the code base.
- When deploying the assistant will:
  - Run the build and report build status (success/failure).
  - If deployment fails, collect and report logs, correct errors and rebuild.

Logging and transparency
-----------------------
- The assistant will provide concise change summaries and the exact files modified for every edit.
- All commands it runs (build, deploy, tests) will be reported back with success/fail status and key outputs.

Safety and approvals
--------------------
- For any change that can affect customer-facing behavior or billing (deployments, DB migrations, third-party API key additions), the assistant must obtain explicit human approval.

How to change these rules
------------------------
- Humans may edit this file directly in the repository. Changes take effect immediately for future assistant actions.
- For temporary test exceptions, include a comment in the PR or a direct chat instruction authorizing the assistant and referencing the relevant commit/PR.

Contact & Escalation
--------------------
- If the assistant is blocked or uncertain, it will pause and ask for clarification rather than making assumptions.
- For emergencies (site down, data leak), contact the repository owners and escalate per the team's incident response playbook.

Example short checklist the assistant will follow before any production deployment
--------------------------------------------------------------------------------
- Run `npm run build` locally and confirm success.
- Run unit tests (if present) and confirm success.
- Ensure no secrets are written to the repository.
- Confirm the user explicitly asked for deployment.

----

Last updated: 2025-09-28
