const pathValue = process.env.PATH;

if (typeof pathValue !== 'string' || pathValue.length === 0) {
  throw new Error('PATH is required to run CLI tests');
}

export const testPath = pathValue;
