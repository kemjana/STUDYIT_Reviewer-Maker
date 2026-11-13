"use client";
import { useEffect, useState } from "react";

/** The current date, available only after the page has loaded in the browser (so the server and browser never disagree). */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  return now;
}
