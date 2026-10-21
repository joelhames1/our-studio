import { customAlphabet } from 'nanoid';

/** Short, unambiguous ids (no 0/O/1/l). */
export const newId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 12);

/** "Erin’s 50th!" → "erins-50th". */
export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
