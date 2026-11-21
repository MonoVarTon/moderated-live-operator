export type LiveModerationStage = "input" | "output";

export type LiveModerationDecision =
  | "allow"
  | "block"
  | "review"
  | "unavailable";

export type LiveModerationRequest = {
  stage: LiveModerationStage;
  text: string;
  signal: AbortSignal;
};

export type LiveModerationProvider = (
  request: LiveModerationRequest
) => Promise<LiveModerationDecision>;

export type LiveModerationOutcome = "allowed" | "rejected" | "unavailable";

export const missingLiveModerationProvider: LiveModerationProvider = async () =>
  "unavailable";

export function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });

  return Promise.race([operation, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
}

export async function runLiveModeration(
  provider: LiveModerationProvider,
  request: LiveModerationRequest
): Promise<LiveModerationOutcome> {
  try {
    const decision = await abortable(
      Promise.resolve().then(() => provider(request)),
      request.signal
    );
    if (decision === "allow") return "allowed";
    if (decision === "block" || decision === "review") return "rejected";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
