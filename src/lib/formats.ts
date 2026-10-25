import { FORMATS } from '../../shared/journal.mjs';
import type { Format } from '@/types';

export const formatItems = FORMATS.map(value => ({ value: value as Format, label: value.toUpperCase() }));
