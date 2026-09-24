import { useEffect } from 'react';

/** Sets the document title for the current screen, then restores the product name. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Authority Diff`;
    return () => {
      document.title = 'Authority Diff';
    };
  }, [title]);
}
