# Contributing

Thanks for helping improve go-router. Contributions of code, documentation, tests, and deployment examples are welcome.

## Local setup

You need Node.js 24, pnpm 11, Docker, and Git.

```sh
corepack enable
pnpm install
docker compose up -d postgres
cp .env.example .env
pnpm db:migrate
pnpm dev
```

The manager runs at `http://localhost:5173/admin` during Vite development and the API runs at `http://localhost:3000`. The production build serves both from port 3000.

## Making a change

1. Open an issue for a substantial feature or behavior change so its scope can be agreed first.
2. Keep pull requests focused and add tests for observable behavior.
3. Generate a committed SQL migration with `pnpm db:generate` when changing the Drizzle schema. Do not edit an already-released migration.
4. Run the same checks as CI:

   ```sh
   pnpm format:check
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   pnpm test:e2e
   helm lint deploy/helm/go-router --set-string database.url=postgresql://user:pass@postgres:5432/go_router
   terraform -chdir=infra/terraform fmt -check -recursive
   ```

Use Conventional Commit-style subjects when practical (`feat:`, `fix:`, `docs:`), but a clear description matters more than a prefix. Explain operational or compatibility impact in the pull request.

## Database and compatibility

Migration code must remain safe when multiple release processes race: the migrator owns a PostgreSQL advisory lock. Application replicas must never run migrations during startup. Preserve existing API response shapes or call out an intentional breaking change.

Never commit credentials, connection strings, Terraform state, production data, or internal hostnames.

## Publishing a release

Version tags publish `ghcr.io/ORG/go-router` and the `charts/go-router` OCI package. GitHub Container Registry creates new packages as private unless repository or organization settings say otherwise, and this repository's workflow does not change package visibility. After the first tagged publish—and before advertising anonymous pulls—an owner must set **both** packages to Public in GitHub's package settings. See GitHub's [package access and visibility guidance](https://docs.github.com/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## Conduct and license

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
