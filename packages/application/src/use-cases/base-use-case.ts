/**
 * Base use case interface
 * All use cases implement this contract
 */
export interface UseCase<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse>;
}

/**
 * Result wrapper for use case responses
 */
export type Result<T, E = Error> =
  { success: true; value: T } | { success: false; error: E };

export const Success = <T>(value: T): Result<T, never> => ({
  success: true,
  value,
});

export const Failure = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});
