import type { ComponentPropsWithoutRef } from 'react';
import { joinClassNames } from '../join-class-names.ts';

export function PageTitle({ className, ...props }: ComponentPropsWithoutRef<'h1'>) {
  return (
    <h1 className={joinClassNames('m-0 mb-4 text-2xl leading-normal', className)} {...props} />
  );
}
