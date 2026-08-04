import { WordItem } from '../types';
import { PAGES_1_3 } from './words1_3';
import { PAGES_4_6 } from './words4_6';
import { PAGES_7_9 } from './words7_9';
import { PAGES_10_13 } from './words10_13';

export const INITIAL_VOCABULARY_DATA: Record<string, Omit<WordItem, 'id' | 'page'>[]> = {
  ...PAGES_1_3,
  ...PAGES_4_6,
  ...PAGES_7_9,
  ...PAGES_10_13,
};
