import cardsJson from '../../../docs/canvas/cards.json';
import { cardsFileSchema, type Card } from './types';

export * from './types';

export const SEED_CARDS: Card[] = cardsFileSchema.parse(cardsJson).cards;
export * from './layout';
