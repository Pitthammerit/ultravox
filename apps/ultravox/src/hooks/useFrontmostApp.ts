import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface FrontmostApp {
  bundle_id: string | null;
  localized_name: string | null;
}

export function useFrontmostApp(pollIntervalMs = 0): {
  app: FrontmostApp | null;
  refresh: () => Promise<void>;
} {
  const [app, setApp] = useState<FrontmostApp | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<FrontmostApp>("get_frontmost_app");
      setApp(result);
    } catch {
      setApp(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (pollIntervalMs > 0) {
      const id = setInterval(refresh, pollIntervalMs);
      return () => clearInterval(id);
    }
  }, [refresh, pollIntervalMs]);

  return { app, refresh };
}
