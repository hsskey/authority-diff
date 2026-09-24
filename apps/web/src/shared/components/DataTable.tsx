import type { ComponentPropsWithoutRef } from 'react';
import { joinClassNames } from '../join-class-names.ts';

const CELL = 'border-b border-gray-200 px-[0.6rem] py-2 align-top dark:border-gray-700';

function alignment(numeric: boolean): string {
  return numeric ? 'text-right tabular-nums' : 'text-left';
}

export function DataTable(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.9rem]" {...props} />
    </div>
  );
}

export function TableCaption(props: ComponentPropsWithoutRef<'caption'>) {
  return <caption className="pb-2 text-left text-[0.85rem] text-gray-500" {...props} />;
}

export function Th({
  numeric = false,
  ...props
}: ComponentPropsWithoutRef<'th'> & { numeric?: boolean }) {
  return (
    <th
      className={joinClassNames(
        CELL,
        'text-[0.75rem] tracking-[0.04em] whitespace-nowrap text-gray-500 uppercase',
        alignment(numeric),
      )}
      {...props}
    />
  );
}

export function Td({
  numeric = false,
  className,
  ...props
}: ComponentPropsWithoutRef<'td'> & { numeric?: boolean }) {
  return <td className={joinClassNames(CELL, alignment(numeric), className)} {...props} />;
}
