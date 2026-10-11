import { classifyError, computeBackoff, interruptibleDelay, RETRY_MAX_ATTEMPTS } from "@/vendor/openmaus/server/drivers/retry";

// Only replay model inference. Desktop actions and outgoing messages never use this retry policy.
export async function providerRequest(operation: () => Promise<Response>, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await operation();
      if (response.ok) return response;
      throw new Error(`Model HTTP ${response.status}: ${(await response.text()).slice(0, 800)}`);
    } catch (error) {
      signal.throwIfAborted();
      if (attempt >= RETRY_MAX_ATTEMPTS - 1 || !classifyError(error instanceof Error ? error : new Error(String(error))).transient) throw error;
      await interruptibleDelay(computeBackoff(attempt), signal).promise;
    }
  }
}
