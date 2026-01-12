
import { Card, Deck, DeckItem } from '../types';

const BASE_URL = 'https://api.scryfall.com';

export const scryfallService = {
  async searchCards(query: string): Promise<Card[]> {
    try {
      const response = await fetch(`${BASE_URL}/cards/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error searching cards:', error);
      return [];
    }
  },

  async getCardByName(name: string): Promise<Card | null> {
    try {
      const response = await fetch(`${BASE_URL}/cards/named?exact=${encodeURIComponent(name)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error(`Error fetching card ${name}:`, error);
      return null;
    }
  },

  async getCardsBatch(identifiers: { name?: string; set?: string; collector_number?: string }[]): Promise<Card[]> {
    try {
      // Scryfall collection endpoint accepts max 75 per request
      const chunks = [];
      for (let i = 0; i < identifiers.length; i += 75) {
        chunks.push(identifiers.slice(i, i + 75));
      }

      const results: Card[] = [];
      for (const chunk of chunks) {
        const response = await fetch(`${BASE_URL}/cards/collection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: chunk })
        });
        if (response.ok) {
          const data = await response.json();
          // Filter to ensure only valid card objects are added to results, avoiding {} objects
          const validCards = (data.data || []).filter((c: any) => c && c.name && c.legalities) as Card[];
          results.push(...validCards);
        }
      }
      return results;
    } catch (error) {
      console.error('Error in batch fetch:', error);
      return [];
    }
  },

  formatForArena(deck: Deck): string {
    let output = '';
    
    if (deck.commander) {
      output += `Commander\n${deck.commander.count} ${deck.commander.card.name} (${deck.commander.card.set.toUpperCase()}) ${deck.commander.card.collector_number}\n\n`;
    }

    const main = deck.mainboard.map(item => 
      `${item.count} ${item.card.name} (${item.card.set.toUpperCase()}) ${item.card.collector_number}`
    ).join('\n');
    
    output += `Deck\n${main}`;

    if (deck.sideboard && deck.sideboard.length > 0) {
      output += '\n\nSideboard\n' + deck.sideboard.map(item => 
        `${item.count} ${item.card.name} (${item.card.set.toUpperCase()}) ${item.card.collector_number}`
      ).join('\n');
    }

    return output;
  },

  async parseArenaText(text: string): Promise<Deck> {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Use an explicit type alias to prevent literal narrowing issues with 'typeof' (fixes Error line 96)
    type DeckSection = 'commander' | 'deck' | 'sideboard';
    let section: DeckSection = 'deck';
    
    const rawItems: { name: string; count: number; section: DeckSection }[] = [];

    for (const line of lines) {
      const low = line.toLowerCase();
      if (low === 'commander') { section = 'commander'; continue; }
      if (low === 'deck') { section = 'deck'; continue; }
      if (low === 'sideboard') { section = 'sideboard'; continue; }

      // Match format: "1 Card Name (SET) 123" or just "1 Card Name"
      const match = line.match(/^(\d+)\s+(.+?)(?:\s+\((.+?)\)\s+(\d+))?$/);
      if (match) {
        const count = parseInt(match[1], 10);
        const name = match[2].trim();
        rawItems.push({ name, count, section });
      }
    }

    // Batch fetch all card details
    const identifiers = rawItems.map(item => ({ name: item.name }));
    const cardData = await this.getCardsBatch(identifiers);
    // Explicitly type the map to ensure values are Cards (fixes Error line 116)
    const cardMap = new Map<string, Card>(cardData.map(c => [c.name.toLowerCase(), c]));

    const deck: Deck = {
      name: "Imported Deck",
      explanation: "Manually imported via grimoire.",
      mainboard: [],
      sideboard: []
    };

    for (const item of rawItems) {
      const card = cardMap.get(item.name.toLowerCase());
      // Ensure the card exists and is a full Card object before proceeding (fixes Error line 116)
      if (!card || !card.name || !card.legalities) continue;

      const deckItem: DeckItem = { count: item.count, card };
      // Explicit comparisons against DeckSection union avoid "no overlap" errors (fixes Errors line 117-118)
      if (item.section === 'commander') {
        deck.commander = deckItem;
      } else if (item.section === 'sideboard') {
        deck.sideboard.push(deckItem);
      } else {
        deck.mainboard.push(deckItem);
      }
    }

    return deck;
  }
};