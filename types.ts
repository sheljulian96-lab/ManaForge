
export type ArenaFormat = 'Standard' | 'Alchemy' | 'Explorer' | 'Historic' | 'Timeless' | 'Brawl';

export interface Card {
  name: string;
  set: string;
  collector_number: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  card_faces?: {
    name: string;
    oracle_text: string;
    mana_cost: string;
    cmc?: number;
    image_uris?: {
      normal: string;
      small: string;
    };
  }[];
  image_uris?: {
    normal: string;
    small: string;
  };
  prices?: {
    usd: string | null;
  };
  legalities: {
    standard: string;
    alchemy: string;
    explorer: string;
    historic: string;
    timeless: string;
    brawl: string;
    historicbrawl: string;
  };
}

export interface DeckItem {
  count: number;
  card: Card;
}

export interface Deck {
  name: string;
  explanation: string;
  strategyTips?: string[];
  mechanics?: string[];
  commander?: DeckItem;
  mainboard: DeckItem[];
  sideboard: DeckItem[];
}

export interface SavedDeck extends Deck {
  id: string;
  format: ArenaFormat;
  timestamp: number;
}

export interface MetaScoutData {
  summary: string;
  archetypes: {
    name: string;
    description: string;
    tier: string;
    winRate?: string;
  }[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  deck?: Deck;
  metaScout?: MetaScoutData;
  sources?: any[];
}

export enum ManaColor {
  White = 'W',
  Blue = 'U',
  Black = 'B',
  Red = 'R',
  Green = 'G'
}
