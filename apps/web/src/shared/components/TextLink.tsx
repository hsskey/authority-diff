import { createLink } from '@tanstack/react-router';
import type { ComponentPropsWithRef } from 'react';
import { joinClassNames } from '../join-class-names.ts';

function UnderlinedAnchor({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return (
    <a className={joinClassNames('underline underline-offset-[0.15em]', className)} {...props} />
  );
}

export const TextLink = createLink(UnderlinedAnchor);
