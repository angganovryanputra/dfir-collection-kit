import { useEffect, useRef } from "react";

type AdaptivePollingOptions = {
  enabled: boolean;
  onPoll: () => Promise<string | undefined>;
  initialInterval: number;
  maxInterval: number;
};

/**
 * Polls immediately, then backs off while a caller-provided state fingerprint
 * remains unchanged.  It never schedules overlapping requests and always
 * clears its timer when a component unmounts or polling is disabled.
 */
export function useAdaptivePolling({
  enabled,
  onPoll,
  initialInterval,
  maxInterval,
}: AdaptivePollingOptions): void {
  const onPollRef = useRef(onPoll);

  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousFingerprint: string | undefined;
    let interval = Math.max(1_000, initialInterval);
    const maximum = Math.max(interval, maxInterval);

    const schedule = () => {
      if (!cancelled) timer = setTimeout(poll, interval);
    };

    const poll = async () => {
      try {
        const fingerprint = await onPollRef.current();
        if (cancelled) return;
        interval = fingerprint === previousFingerprint
          ? Math.min(maximum, interval * 2)
          : Math.max(1_000, initialInterval);
        previousFingerprint = fingerprint;
      } catch {
        if (cancelled) return;
        // A temporary failure should reduce pressure on an unavailable API.
        interval = Math.min(maximum, interval * 2);
      }
      schedule();
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, initialInterval, maxInterval]);
}
