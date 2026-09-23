/**
 * Credential rotation for a failed chat attempt (TD-CHAT-3).
 *
 * Extract Method on the loop the chat handler ran after its primary attempt
 * failed with a status-carrying error: report the failed key to the pool,
 * take the next key and replay the attempt on the SAME model, until a key
 * answers, the pool is exhausted, or a failure ends the rotation. Only then
 * does the caller hand the last error to the model fallback chain, passing
 * `poolExhausted` so that even a non-retryable failure may reach a configured
 * fallback.
 *
 * The loop is moved unchanged; the handler's closure reads became the typed
 * input below.
 */
import { extractStatusCode, type CredentialPool } from '@waggle/agent';
import {
  isEmptyModelResponseError,
  isIncompleteCompletionError,
  isTerminalModelBudgetError,
} from './chat-attempt-policy.js';

export type CredentialRotationPool = Pick<
  CredentialPool,
  'size' | 'getNameForKey' | 'reportError' | 'getKey' | 'reportSuccess'
>;

export interface CredentialRotationInput<T> {
  pool: CredentialRotationPool;
  /** The key the failed attempt used. */
  failedKey: string;
  /** The failed attempt's error. */
  error: unknown;
  /** Replays the attempt on the same model with `key`. */
  runWithKey: (key: string) => Promise<T>;
  isAborted: () => boolean;
  isReplayBlocked: () => boolean;
  /** Announces a rotation before the replay. */
  onRotate: () => void;
  warn: (message: string) => void;
}

export interface CredentialRotationOutcome<T> {
  /** The replayed attempt's answer, or null when no key answered. */
  result: T | null;
  /** The last failure, for the fallback chain when `result` is null. */
  error: unknown;
  /** True when every key failed or the pool had no key left to try. */
  poolExhausted: boolean;
}

/**
 * Rotates through the pool's keys after a failed attempt. Throws when the turn
 * was aborted, when a replay would repeat a side effect, or when a replay
 * fails with an incomplete completion or a terminal budget error.
 */
export async function rotateCredentials<T>(input: CredentialRotationInput<T>): Promise<CredentialRotationOutcome<T>> {
  const { pool } = input;
  let failedKey = input.failedKey;
  let credentialError = input.error;
  let credentialResult: T | null = null;
  let poolExhausted = false;

  for (let failureIndex = 0; failureIndex < pool.size; failureIndex++) {
    const errorStatus = extractStatusCode(credentialError);
    if (!errorStatus) break;

    const keyName = pool.getNameForKey(failedKey) ?? failedKey;
    const hasMore = pool.reportError(
      failedKey,
      errorStatus,
      (credentialError as Error).message,
    );
    input.warn(`[credential-pool] Key ${keyName} failed (${errorStatus}), cooldown applied. More keys: ${hasMore}`);

    if (!hasMore || failureIndex === pool.size - 1) {
      poolExhausted = true;
      break;
    }

    const nextKey = pool.getKey();
    if (!nextKey) {
      poolExhausted = true;
      break;
    }
    input.onRotate();
    try {
      credentialResult = await input.runWithKey(nextKey);
      pool.reportSuccess(nextKey);
      break;
    } catch (nextCredentialError) {
      if (input.isAborted()) throw nextCredentialError;
      if (input.isReplayBlocked()) {
        throw nextCredentialError;
      }
      if (isEmptyModelResponseError(nextCredentialError)) {
        credentialError = nextCredentialError;
        break;
      }
      if (isIncompleteCompletionError(nextCredentialError)
        || isTerminalModelBudgetError(nextCredentialError)) {
        throw nextCredentialError;
      }
      failedKey = nextKey;
      credentialError = nextCredentialError;
    }
  }

  return { result: credentialResult, error: credentialError, poolExhausted };
}
