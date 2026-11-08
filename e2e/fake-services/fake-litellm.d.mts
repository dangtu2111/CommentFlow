import type { Server } from 'node:http';

export function labelFor(text: string): string;
export function asksFor(text: string): string[];
export function extractReply(userText: string): {
  labels: Array<{ label: string }>;
  asks: string[];
};
export function draftReply(promptText: string): {
  needs_human: boolean;
  sources: string[];
  claims: Array<{ source_ids: string[] }>;
};
export function createFakeLitellm(): Server;
