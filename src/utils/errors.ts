export function printError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}
