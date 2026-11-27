import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendEmail } from "@/lib/server-fns";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Sends a list of messages one at a time through the sendEmail server function.
// A message may carry `build()` to create its attachments just before sending
// (PDFs), so a large batch doesn't hold every file in memory. Stops early when
// Base44's sending limit is reached or when Stop is pressed.
export function useSender() {
  const send = useServerFn(sendEmail);
  const [state, setState] = useState(null); // { total, done, sent, failed, results, running, stopped, limited }
  const stopRef = useRef(false);

  const run = useCallback(
    async (messages, { onSent } = {}) => {
      stopRef.current = false;
      let s = { total: messages.length, done: 0, sent: 0, failed: 0, results: [], running: true, stopped: false, limited: false };
      setState(s);
      const cache = new Map();
      for (const m of messages) {
        if (stopRef.current) {
          s = { ...s, stopped: true };
          break;
        }
        let result;
        try {
          let attachments = m.attachments;
          if (m.build) {
            if (!cache.has(m.buildKey)) cache.set(m.buildKey, m.build());
            attachments = await cache.get(m.buildKey);
          }
          const { build, buildKey, label, ...data } = m; // eslint-disable-line no-unused-vars
          result = await send({ data: { ...data, ...(attachments?.length ? { attachments } : {}) } });
        } catch (err) {
          result = { status: "failed", error: err?.message || "Couldn't send", limited: false };
        }
        const ok = result.status === "sent";
        s = {
          ...s,
          done: s.done + 1,
          sent: s.sent + (ok ? 1 : 0),
          failed: s.failed + (ok ? 0 : 1),
          results: [...s.results, { to: m.to, label: m.label || m.subject, ok, error: result.error }],
        };
        setState(s);
        if (ok) await onSent?.(m);
        if (result.limited) {
          s = { ...s, limited: true, stopped: true };
          break;
        }
        await pause(250);
      }
      s = { ...s, running: false };
      setState(s);
      return s;
    },
    [send]
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);
  const reset = useCallback(() => setState(null), []);

  return { state, run, stop, reset };
}
