import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Puts API field errors on the matching inputs; returns the message for anything else. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: readonly string[]): string | null {
  if (!(err instanceof ApiError)) return 'Could not reach the server. Check your connection and try again.';
  let placed = false;
  for (const [key, messages] of Object.entries(err.fieldErrors)) {
    if (fields.includes(key)) {
      setError(key as Path<T>, { message: messages[0] });
      placed = true;
    }
  }
  return placed ? null : err.message;
}
