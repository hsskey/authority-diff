import type { AppError, IdGenerator, Logger, Result } from '@authority/kernel';
import type { Config, Database } from '@authority/platform';

export interface AppEnv {
  readonly Variables: { requestId: string };
}

export interface ReadinessProbe {
  ping(): Promise<Result<true, AppError>>;
}

export interface ServerDeps {
  readonly config: Config;
  readonly logger: Logger;
  readonly idGenerator: IdGenerator;
  readonly db: Database;
}
