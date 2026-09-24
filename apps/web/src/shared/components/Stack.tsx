import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { joinClassNames } from '../join-class-names.ts';

const STACK_CLASS = 'grid gap-5';

type StackProps<T extends ElementType> = {
  readonly as?: T;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

export function Stack<T extends ElementType = 'div'>({ as, className, ...props }: StackProps<T>) {
  const Component = as ?? 'div';
  return <Component className={joinClassNames(STACK_CLASS, className)} {...props} />;
}
