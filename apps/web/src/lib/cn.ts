import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gộp class có điều kiện và loại class Tailwind xung đột (class sau thắng). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
