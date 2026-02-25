import { Buffer } from 'buffer';
import process from 'process';

// Ensure Node globals exist before any SDK imports run.
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = process;
(globalThis as any).global = globalThis;
