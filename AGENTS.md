# vscode-marimo

VS Code extension to run marimo notebooks, published to the Marketplace as `marimo-team.marimo`.

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm lint        # biome check --write . (autofix.ci runs this on PRs)
pnpm typecheck   # tsc --noEmit
pnpm build       # tsup -> dist/extension.js
pnpm pack        # vsce package --no-dependencies -> .vsix
```

- Repo is deprecated; active development moved to [marimo-lsp](https://github.com/marimo-team/marimo-lsp).
- `pnpm test` includes integration tests under `src/__integration__/` that launch a real marimo server — they need `marimo` on PATH and fail without it.
- Packaging/publishing use `vsce` (`pnpm pack` / `pnpm publish` / `pnpm release`), not npm.
- CI is `workflow_dispatch`-only; run the commands above locally.
