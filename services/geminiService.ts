
import { GoogleGenAI, Type } from "@google/genai";
import { scryfallService } from "./scryfallService";
import { ArenaFormat } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const DECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Theme-appropriate deck name" },
    explanation: { type: Type.STRING, description: "Executive summary of the deck's strategy" },
    strategyTips: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Advanced strategic tips for playing the deck (e.g. Surveil prioritization, Firebending triggers)" 
    },
    mechanics: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Key mechanics highlighted (e.g. Eerie, Airbend, Impending)" 
    },
    commander: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        count: { type: Type.NUMBER, description: "Should always be 1 for commander" }
      },
      description: "Only used for Brawl/Commander formats"
    },
    mainboard: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          count: { type: Type.NUMBER }
        },
        required: ["name", "count"]
      }
    },
    sideboard: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          count: { type: Type.NUMBER }
        },
        required: ["name", "count"]
      }
    }
  },
  required: ["name", "explanation", "mainboard", "sideboard", "strategyTips", "mechanics"]
};

const SCOUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Brief overview of the current format meta" },
    archetypes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Archetype name (e.g. Boros Convoke)" },
          description: { type: Type.STRING, description: "Short description of why it's winning" },
          tier: { type: Type.STRING, description: "Meta tier: S, A, or B" },
          winRate: { type: Type.STRING, description: "Approximate win rate percentage if available" }
        },
        required: ["name", "description", "tier"]
      }
    }
  },
  required: ["summary", "archetypes"]
};

export const geminiService = {
  async generateDeck(prompt: string, format: ArenaFormat = 'Standard') {
    const isBrawl = format === 'Brawl';
    const systemPrompt = `You are the Oracle of the Multiverse, a top-tier MTG Arena analyst and architect.
    You have absolute knowledge of ALL cards currently available on MTG Arena, including expansion sets like "Duskmourn: House of Horror" (DSK) and the hypothetical "Avatar: The Last Airbender" (Set TLA/TLE).
    
    SET KNOWLEDGE (DSK):
    - Mechanics: Eerie (unlocked Room or Enchantment entry triggers), Impending (play for less, enters as non-creature with counters), Survival.
    - Key Cards: Entity Tracker, Overlord cycles, Room cards like Central Elevator.
    
    SET KNOWLEDGE (TLA):
    - Mechanics: Airbend (blink/protection), Waterbend (mana/tapping), Earthbend (land transformation), Firebending (mana generation on attack).
    - Key Cards: Avatar Aang, Ozai, Phoenix King, Sozin's Comet, Appa, Steadfast Guardian.
    
    CRITICAL RULES:
    1. Suggest decks that are HIGHLY competitive and "sweaty" for the chosen format: ${format}.
    2. Ensure mana bases are optimized using Verges (Blazemire/Gloomlake) and Surveil lands.
    3. Provide sophisticated strategic advice including when to hold spells and how to use specific mechanic synergies.
    4. If format is 'Brawl', you MUST provide a 'commander' and 99 unique other cards.
    
    Use Google Search to verify the very latest meta trends and win-rates.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Forge a top-tier ${format} deck. Theme/Request: ${prompt}. Ensure you include strategic insights for the 2026 metagame.`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: DECK_SCHEMA,
        tools: [{ googleSearch: {} }]
      }
    });

    const data = JSON.parse(response.text);
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const hydrate = async (item: any) => {
      if (!item) return null;
      const cardData = await scryfallService.getCardByName(item.name);
      if (!cardData) {
        return { 
          count: item.count, 
          card: { 
            name: item.name, 
            set: 'TLA', 
            collector_number: '?', 
            mana_cost: '{?}', 
            cmc: 0,
            type_line: 'Legendary Creature — Avatar',
            oracle_text: 'Bending synergy card.',
            legalities: { standard: 'legal', alchemy: 'legal', explorer: 'legal', historic: 'legal', timeless: 'legal', brawl: 'legal', historicbrawl: 'legal' }
          } 
        };
      }
      return { count: item.count, card: cardData };
    };

    const hydratedCommander = isBrawl && data.commander ? await hydrate(data.commander) : undefined;
    const hydratedMainboard = (await Promise.all(data.mainboard.map(hydrate))).filter(Boolean);
    const hydratedSideboard = (await Promise.all(data.sideboard.map(hydrate))).filter(Boolean);

    return {
      deck: {
        ...data,
        commander: hydratedCommander || undefined,
        mainboard: hydratedMainboard,
        sideboard: hydratedSideboard
      },
      sources
    };
  },

  async scoutMeta(format: ArenaFormat) {
    const systemPrompt = `You are a professional MTG Meta Analyst. 
    Use Google Search to find current top-tier decks, win rates, and tournament standings for MTG Arena ${format}.
    Scrape data mentally from Untapped.gg, MTGGoldfish, and recent Pro Tour results.
    Look specifically for how new mechanics from DSK and TLA are impacting the meta.
    Return a summary of the meta and a list of identified winning archetypes with win rates if possible.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Search the web for the current top tier meta decks for MTG Arena ${format} in 2026. Provide win rates if available.`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: SCOUT_SCHEMA,
        tools: [{ googleSearch: {} }]
      }
    });

    const data = JSON.parse(response.text);
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { data, sources };
  }
};
