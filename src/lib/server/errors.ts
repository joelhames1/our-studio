/** An error with an HTTP status, whose message is safe to show the person who asked. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
