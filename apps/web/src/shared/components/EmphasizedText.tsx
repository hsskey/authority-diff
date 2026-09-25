import type { Emphasized } from '../i18n/en.ts';

export function EmphasizedText({ parts }: { parts: Emphasized }) {
  return parts.map((part, index) =>
    typeof part === 'string' ? part : <strong key={index}>{part.em}</strong>,
  );
}
