# Contributing

## Development

- Run `pnpm install` in the root directory to install dependencies.
- Run `pnpm dev` to start the compiler in watch mode.
- Press `F5` to open a new window with your extension loaded.

### Make changes

- Relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
- `Ctrl+R` or `Cmd+R` on Mac will reload the extension with your changes.

## Release (only for maintainers)

- Run `pnpm run release` to create a new release.
  - This requires a valid vsce token
- Run `pnpm run openvsx:publish <token>` to publish the release to OpenVSX.
  - This requires a valid OpenVSX token
