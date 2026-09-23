import { pino, stdSerializers } from 'pino';
import type { DestinationStream } from 'pino';
import type { Logger } from '@authority/kernel';
import type { Config } from './config.ts';

const REDACT_PATHS = [
  '*.token',
  '*.apiKey',
  'headers.authorization',
  '*.toolInputRedacted',
  '*.mandateText',
];

export interface LoggerOptions {
  readonly service?: string;
  readonly destination?: DestinationStream;
}

export function createLogger(config: Config, options?: LoggerOptions): Logger {
  const pinoOptions = {
    level: config.log.level,
    base: { service: options?.service ?? 'server' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: { cause: stdSerializers.err },
  };
  const instance = options?.destination
    ? pino(pinoOptions, options.destination)
    : pino(pinoOptions);
  return {
    debug: (msg, fields) => {
      instance.debug(fields ?? {}, msg);
    },
    info: (msg, fields) => {
      instance.info(fields ?? {}, msg);
    },
    warn: (msg, fields) => {
      instance.warn(fields ?? {}, msg);
    },
    error: (msg, fields) => {
      instance.error(fields ?? {}, msg);
    },
  };
}
