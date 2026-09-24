import type { ComponentPropsWithoutRef } from 'react';
import { joinClassNames } from '../join-class-names.ts';

export function SectionTitle({ className, ...props }: ComponentPropsWithoutRef<'h2'>) {
  return <h2 className={joinClassNames('m-0 text-lg leading-normal', className)} {...props} />;
}
