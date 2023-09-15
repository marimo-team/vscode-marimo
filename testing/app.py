import marimo

__generated_with = "0.1.8"
app = marimo.App()


@app.cell
def __():
    import marimo as mo
    return mo,


@app.cell
def __():
    x = 2 + 2
    return x,


@app.cell
def __(x):
    x
    return


if __name__ == "__main__":
    app.run()
