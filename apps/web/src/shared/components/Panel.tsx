import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { joinClassNames } from '../join-class-names.ts';

const PANEL_CLASS = 'rounded-lg border border-border bg-panel px-5 py-4';

type PanelProps<T extends ElementType> = {
  readonly as?: T;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

export function Panel<T extends ElementType = 'div'>({ as, className, ...props }: PanelProps<T>) {
  const Component = as ?? 'div';
  return <Component className={joinClassNames(PANEL_CLASS, className)} {...props} />;
}

export function PanelStack({ className, ...props }: Omit<PanelProps<'div'>, 'as'>) {
  return <Panel className={joinClassNames('grid gap-5', className)} {...props} />;
}
