/**
 * Marks an error whose message is written for the user. A chat turn that
 * fails shows a marked error's message as it is; any other error's message
 * is internal and is replaced with a generic sentence (TD-CHAT-15).
 *
 * A flag rather than a class: the errors that need it are built by factories
 * that already decorate a plain `Error` with `code`/`status`, and a symbol key
 * cannot arrive from a parsed provider payload.
 */
const USER_FACING = Symbol.for('waggle.userFacingError');

/** Marks `error` as safe to show the user and returns it. */
export function markUserFacingError<E extends Error>(error: E): E {
  Object.defineProperty(error, USER_FACING, { value: true });
  return error;
}

/** True for an error marked by `markUserFacingError`. */
export function isUserFacingError(error: unknown): error is Error {
  return error instanceof Error
    && (error as unknown as Record<symbol, unknown>)[USER_FACING] === true;
}
