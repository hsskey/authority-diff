import type { ComponentPropsWithoutRef } from 'react';
import { Panel } from './Panel.tsx';

export function MetaGrid(props: ComponentPropsWithoutRef<'dl'>) {
  return (
    <Panel
      as="dl"
      className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4 [&_dd]:mt-1 [&_dt]:text-[0.75rem] [&_dt]:tracking-[0.04em] [&_dt]:text-gray-500 [&_dt]:uppercase"
      {...props}
    />
  );
}

export const MONO = 'break-all font-mono text-[0.85em]';
