import { createHash } from 'node:crypto';
export const h = () => createHash('sha256');
