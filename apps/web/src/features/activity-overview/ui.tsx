import type { ComponentProps, ReactNode } from 'react';

type Effect = 'allow' | 'ask' | 'deny';

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

const PANEL = 'rounded-lg border border-border bg-panel px-5 py-4';
const CELL_BOX = 'border-b border-gray-200 px-[0.6rem] py-2 align-top dark:border-gray-700';
const BUTTON_FACE = 'rounded-md border border-gray-800 bg-gray-900 px-[0.9rem] py-2 text-white';
const EFFECT_TONE: Record<Effect, string> = {
  allow: 'border-emerald-700 text-emerald-700',
  ask: 'border-amber-700 text-amber-700',
  deny: 'border-red-700 text-red-700',
};
const EFFECT_BADGE_TONE: Record<Effect, string> = {
  allow: 'bg-emerald-700/12 text-emerald-700',
  ask: 'bg-amber-700/12 text-amber-700',
  deny: 'bg-red-700/12 text-red-700',
};

export function Stack({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('grid gap-5', className)} {...props} />;
}

export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx(PANEL, className)} {...props} />;
}

export function SectionTitle({
  as: Tag = 'h2',
  ...props
}: ComponentProps<'h2'> & { as?: 'h2' | 'h3' }) {
  return <Tag className="m-0 text-lg leading-normal" {...props} />;
}

export function Hint({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cx('m-0 text-[0.9rem] text-muted', className)} {...props} />;
}

export function StateMessage({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cx('m-0', className)} {...props} />;
}

export function MetaGrid({ className, ...props }: ComponentProps<'dl'>) {
  return (
    <dl
      className={cx(
        PANEL,
        'm-0 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4',
        '[&_dd]:m-0 [&_dd]:mt-1 [&_dt]:text-xs [&_dt]:leading-normal [&_dt]:uppercase [&_dt]:tracking-[0.04em] [&_dt]:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TwoColumn({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cx(
        'grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] items-start gap-5',
        className,
      )}
      {...props}
    />
  );
}

export function EffectSummary({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('grid grid-cols-3 gap-3', className)} {...props} />;
}

export function EffectTile({
  effect,
  label,
  count,
  percent,
}: {
  effect: Effect;
  label: string;
  count: number;
  percent: string;
}) {
  return (
    <div className={cx(PANEL, 'grid gap-[0.15rem] text-center', EFFECT_TONE[effect])}>
      <span className="text-[0.7rem] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-2xl font-semibold leading-normal tabular-nums">{count}</span>
      <span className="text-[0.8rem] text-muted">{percent}</span>
    </div>
  );
}

export function EffectBadge({ effect, children }: { effect: Effect; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-block rounded-full px-2 py-[0.1rem] text-xs font-semibold leading-normal',
        EFFECT_BADGE_TONE[effect],
      )}
    >
      {children}
    </span>
  );
}

export function DataTable({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full border-collapse text-[0.9rem]', className)} {...props} />
    </div>
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return (
    <caption className={cx('pb-2 text-left text-[0.85rem] text-muted', className)} {...props} />
  );
}

export function Th({
  numeric = false,
  className,
  ...props
}: ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      className={cx(
        CELL_BOX,
        'whitespace-nowrap text-xs leading-normal uppercase tracking-[0.04em] text-muted',
        numeric ? 'text-right tabular-nums' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  numeric = false,
  mono = false,
  muted = false,
  nowrap = false,
  className,
  ...props
}: ComponentProps<'td'> & {
  numeric?: boolean;
  mono?: boolean;
  muted?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={cx(
        CELL_BOX,
        numeric ? 'text-right tabular-nums' : 'text-left',
        mono && 'break-all font-mono text-[0.85em]',
        muted && 'text-[0.9rem] text-muted',
        nowrap && 'whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}

export function Mono({ className, ...props }: ComponentProps<'dd'>) {
  return <dd className={cx('break-all font-mono text-[0.85em]', className)} {...props} />;
}

export function Actions({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('flex flex-wrap gap-3', className)} {...props} />;
}

export function PrimaryButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={cx(
        BUTTON_FACE,
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export const BUTTON_LINK = `${BUTTON_FACE} inline-block justify-self-start no-underline`;
