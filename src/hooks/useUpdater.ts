import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdaterState {
  /** An update was found (may still be downloading). */
  available: boolean;
  /** The version string of the available update, if any. */
  version: string | null;
  /** The update finished downloading and can be installed on demand. */
  ready: boolean;
  /** An install + relaunch is in progress (button should show a busy state). */
  applying: boolean;
  /** Install the downloaded update and relaunch into it. User-triggered. */
  apply: () => Promise<void>;
  /** Hide the prompt for this run; it re-appears on the next launch. */
  dismiss: () => void;
}

/**
 * Checks for an app update once on mount and, if one is available, downloads it
 * silently in the background — but NEVER installs or relaunches on its own.
 * Because this is a live-interview copilot, an involuntary relaunch could land
 * mid-session, so applying the update is left to an explicit user action
 * (`apply`, wired to the "Restart now" button in <UpdateBanner>).
 *
 * Fully fail-safe: in dev (no updater endpoint/artifacts) or on any
 * network/verification error it logs and does nothing, so it never blocks
 * startup. The bundle's minisign signature is verified against the `pubkey` in
 * tauri.conf.json before install — a tampered/incorrectly-signed artifact is
 * rejected by the plugin.
 */
export function useUpdater(): UpdaterState {
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const update = await check();
        if (!update || cancelled) return;
        console.info(`[updater] update available: ${update.version}`);
        updateRef.current = update;
        setVersion(update.version);
        setAvailable(true);
        // Download silently in the background; do NOT install/relaunch here.
        await update.download();
        if (cancelled) return;
        setReady(true);
      } catch (err) {
        // Dev mode, offline, or no update endpoint — non-fatal.
        console.warn("[updater] check/download skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    try {
      setApplying(true);
      await update.install();
      await relaunch();
    } catch (err) {
      console.warn("[updater] install/relaunch failed:", err);
      setApplying(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setAvailable(false);
  }, []);

  return { available, version, ready, applying, apply, dismiss };
}
