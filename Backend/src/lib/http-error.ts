export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function parseId(raw: unknown): number {
  const id = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, "Invalid id");
  }
  return id;
}
