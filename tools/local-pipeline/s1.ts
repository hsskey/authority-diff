import { pathToFileURL } from 'node:url';
import { measureReplayWindows } from './lib/s1-measure.ts';
import { S1_DEFAULTS } from '../../tests/workloads/generate-s1.ts';

function formatMs(ms: number): string {
  return ms.toFixed(1);
}

function main(): void {
  const measurements = measureReplayWindows([1, 7, 30], S1_DEFAULTS);
  process.stdout.write(
    `${JSON.stringify(
      {
        generator: S1_DEFAULTS,
        windows: measurements.map((row) => ({
          ...row,
          elapsedMs: Number(formatMs(row.elapsedMs)),
          usPerActionPerVersion: Number(row.usPerActionPerVersion.toFixed(2)),
          chapter17EstimatedMs: Number(row.chapter17EstimatedMs.toFixed(1)),
        })),
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
