# vscode marimo

<a href="https://marketplace.visualstudio.com/items?itemName=marimo-team.vscode-marimo" target="__blank">
  <img src="https://img.shields.io/visual-studio-marketplace/v/marimo-team.vscode-marimo.svg?color=eee&amp;label=VS%20Code%20Marketplace&logo=visual-studio-code" alt="Visual Studio Marketplace Version" />
</a>

Run [marimo](https://github.com/marimo-team/marimo), directly from VS Code.

<p align="center">
  <img src="https://raw.githubusercontent.com/marimo-team/vscode-marimo/main/images/screenshot.png">
</p>

> [!NOTE]
> This extension requires marimo to be installed on your system: `pip install marimo`.
> See the [installation guide](https://docs.marimo.io/getting_started/index.html) for more details.

Check out the marimo documentation at <https://docs.marimo.io/>.

## Features

- 🚀 Launch marimo from VS Code, in both "edit mode" and "run mode".
- 💻 View the terminal output of marimo directly in VS Code.
- 🌐 View the marimo browser window directly in VS Code or in your default browser.
- 📥 Export notebooks as: html, markdown, or scripts.
- 📓 Convert Jupyter notebooks to marimo notebooks.
- 🧪 [experimental] Run marimo in VSCode's native notebook

## Known Issues

VS Code's embedded browser does not support all native browser features. If you encounter any issues, try opening marimo in your default browser instead.
For example, the embedded browser will not support PDF render, audio recording, video recording, and some [copy/paste operations](https://github.com/microsoft/vscode/issues/115935).

## Experimental Native Notebook

This extension includes an experimental feature to run marimo in VSCode's native notebook interface. This feature lets you use VSCode editors and extensions for writing code while the outputs and visualizations are rendered in a view-only marimo editor. This marimo editor displays outputs, console logs, and UI elements to interact with.

This feature is experimental and may have some limitations. Some known limitations are:

- VSCode automatically includes "Run above" and "Run below" buttons in the notebook toolbar. While these work, they do not make sense with a reactive notebook.
- Notebooks can still be edited even though there may not be an active marimo server. This can be confusing since saving or running will not work.
- For autocomplete to work when using native VSCode notebooks for many packages (including `marimo`, `numpy`, and more) you may be required to include a `pyproject.toml` file at the root of the workspace. marimo's editor gets around this by default but unfortunately, the VSCode's native notebook does not.
- You cannot access **many** marimo features in the native notebook (and need to use the marimo browser), such as the variable explorer, dependency viewer, grid mode (plus other layouts), and more - so we show the notebook in "Kiosk Mode" which is a read-only view of the outputs and helper panels.
- VSCode's native notebook does not support different string quoting styles (e.g. `r"""`, `"""`, `f"""`, etc.), so we default all markdown cells to use `r"""`.

## Python Configuration

To ensure marimo works correctly with your Python environment, you have several options:

> [!TIP]
> The extension will use the Python interpreter from the Python extension by default. Make sure you have the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) installed and configured.

1. **Workspace Settings (Recommended)**
   Create or edit `.vscode/settings.json` in your workspace. You can set the default Python interpreter for your entire workspace, or just for marimo.

   For setting the workspace Python interpreter, you can set:

   ```json
   {
     "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python"
   }
   ```

   For setting the Python interpreter only for marimo, you can set:

   ```json
   {
     "marimo.pythonPath": "${workspaceFolder}/.venv/bin/python"
   }
   ```

   If you set `marimo.pythonPath`, the extension will use that interpreter with `-m marimo` to invoke marimo.

2. **Global Settings**
   You can also configure these settings globally in VS Code's settings:

   - Set `python.defaultInterpreterPath` to your preferred Python interpreter
   - Verify that marimo is available in your Python interpreter: `/value/of/defaultInterpreterPath -m marimo`
   - (Likely not needed) Set `marimo.marimoPath` to the path of your marimo installation. When set, the extension will use this path directly `/path/to/marimo` instead of `python -m marimo`.

3. **Virtual Environments**
   If using a virtual environment:
   - Create and activate your virtual environment
   - Install marimo: `pip install marimo`
   - VS Code should automatically detect the Python interpreter

4. **uv projects and package environment sandboxes**
   If you are using `uv` to manage your Python project (e.g. with a `pyproject.toml` file). You can run `uv add marimo` to install marimo in your project's environment. Then update your settings to use:

   ```json
   {
     "marimo.marimoPath": "uv run marimo",
     "marimo.sandbox": true // optional
   }
   ```

5. **uvx and package environment sandboxes**
   If you are not creating Python projects and don't want to create virtual environments, you can use `uvx` with `marimo edit --sandbox` to run marimo in a sandbox.

   ```json
   {
     "marimo.marimoPath": "uvx marimo",
     "marimo.sandbox": true
   }
   ```

## Configuration

- `marimo.browserType`: Browser to open marimo app (`system` or `embedded`, default: `embedded`)
- `marimo.port`: Default port for marimo server (default: `2818`)
- `marimo.sandbox`: Always start marimo in a sandbox, e.g. `marimo edit --sandbox` (default: `false`). Requires [`uv`](https://docs.astral.sh/uv/) to be installed.
- `marimo.watch`: Always start marimo with the `--watch` flag (default: `true`).
- `marimo.host`: Hostname for marimo server (default: `localhost`)
- `marimo.https`: Enable HTTPS for marimo server (default: `false`)
- `marimo.enableToken`: Enable token authentication (default: `false`)
- `marimo.tokenPassword`: Token password (default: _empty_)
- `marimo.showTerminal`: Open the terminal when the server starts (default: `false`)
- `marimo.debug`: Enable debug logging (default: `false`)
- `marimo.pythonPath`: Path to python interpreter (default: the one from python extension). Will be used with `/path/to/python -m marimo` to invoke marimo.
- `marimo.marimoPath`: Path to a marimo executable (default: None). This will override use of the `pythonPath` setting, and instead invoke commands like `/path/to/marimo edit` instead of `python -m marimo edit`.

## Troubleshooting

If you encounter issues, you can open the marimo extension logs by running the `marimo: Show marimo status` command from the command palette.

You can also hover over the marimo status bar item in the bottom left of the VSCode window to see the status of the marimo extension.
