"use client";

import { useEffect, useState } from "react";

import { REDUCED_MOTION_MEDIA_QUERY } from "./motion";

/**
 * Subscribe to the user's `prefers-reduced-motion` setting (R18.5).
 *
 * Starts as `false` so first paint never gates content on motion (R18.6),
 * then syncs to the real preference after mount and updates live if the user
 * changes it. Client components use this to skip parallax / cursor-tracking /
 * rotation while keeping all functionality.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_MEDIA_QUERY);
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };

    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  return reduced;
}
