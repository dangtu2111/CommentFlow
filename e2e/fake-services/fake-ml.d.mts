import type { Server } from 'node:http';

export const FAKE_ML_MODEL: string;
export function fakeVector(text: string): number[];
export function createFakeMl(model?: string): Server;
