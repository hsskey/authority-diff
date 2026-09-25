import { describe, expect, it } from 'vitest';

import { catalogKeyFailures } from '../check-i18n-keys.ts';

const greet = (name: string) => `Hello ${name}`;

describe('catalogKeyFailures', () => {
  it('accepts catalogs with the same keys and kinds', () => {
    const catalogs = {
      en: { title: 'Title', nested: { greet } },
      ko: { title: '제목', nested: { greet: (name: string) => `${name} 안녕` } },
    };
    expect(catalogKeyFailures(catalogs)).toEqual([]);
  });

  it.each([
    {
      case: 'a key only English has',
      catalogs: { en: { title: 'Title', nested: { greet } }, ko: { title: '제목', nested: {} } },
      failure: 'ko: missing nested.greet',
    },
    {
      case: 'a key only Korean has',
      catalogs: { en: { title: 'Title' }, ko: { title: '제목', extra: '추가' } },
      failure: 'en: missing extra',
    },
    {
      case: 'an empty message',
      catalogs: { en: { title: 'Title' }, ko: { title: '' } },
      failure: 'ko: title is empty or not a message',
    },
  ])('reports $case', ({ catalogs, failure }) => {
    expect(catalogKeyFailures(catalogs)).toEqual([failure]);
  });

  it('reports a key that is text in one language and a template in another', () => {
    const catalogs = { en: { title: greet }, ko: { title: '제목' } };
    expect(catalogKeyFailures(catalogs)).toEqual([
      'en: title is a template, not the same kind in every language',
      'ko: title is a text, not the same kind in every language',
    ]);
  });
});
