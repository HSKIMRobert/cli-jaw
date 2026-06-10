/**
 * #233 — Manager event stream hook.
 *
 * Subscribes to GET /api/manager/events/stream (SSE) and invokes the callback
 * when a worker's settings change (cli/model/projectDirs). Complements the
 * 5s/10s polls, which only carry message activity — without this, sidebar
 * metadata waits for a manual refresh. EventSource owns reconnection.
 */

import { useEffect, useRef } from 'react';

type StreamFrame = {
    topic?: string;
    event?: string;
    data?: { port?: number };
};

export function useManagerEventStream(onSettingsChange: (port: number) => void): void {
    const callbackRef = useRef(onSettingsChange);
    callbackRef.current = onSettingsChange;

    useEffect(() => {
        const source = new EventSource('/api/manager/events/stream');
        source.onmessage = (e: MessageEvent) => {
            let frame: StreamFrame;
            try {
                frame = JSON.parse(String(e.data)) as StreamFrame;
            } catch {
                return; // malformed frame — ignore
            }
            if (frame.topic !== 'worker' || frame.event !== 'worker_settings_change') return;
            const port = frame.data?.port;
            if (typeof port === 'number' && Number.isInteger(port)) callbackRef.current(port);
        };
        return () => { source.close(); };
    }, []);
}
