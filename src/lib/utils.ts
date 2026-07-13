import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True when the timestamp is within the last five minutes. Server-side use
 * only (client renders would drift from the HTML). */
export function isRecent(isoTimestamp: string): boolean {
  return Date.now() - new Date(isoTimestamp).getTime() < 5 * 60 * 1000;
}
