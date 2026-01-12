
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { geminiService } from './services/geminiService';
import { scryfallService } from './services/scryfallService';
import { liveService, FORGE_DECK_TOOL } from './services/liveService';
import { ChatMessage, Deck, Card, ArenaFormat, SavedDeck, MetaScoutData } from './types';
import { ManaIcon, ManaCost } from './components/ManaIcons';
import { ManaCurve } from './components/ManaCurve';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Greetings, Planeswalker. I am synced with the latest MTG Arena database and the Avatar (TLA) archives. Which format shall we brew in today?" }
  ]);
  const [input, setInput] = useState('');
  const [format, setFormat] = useState<ArenaFormat>('Standard');
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCodexOpen, setIsCodexOpen] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<Card[]>([]);
  const [importText, setImportText] = useState('');
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'error' } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextAudioStartTimeRef = useRef<number>(0);
  const transcriptionsRef = useRef<{ user: string; model: string }>({ user: '', model: '' });

  useEffect(() => {
    const stored = localStorage.getItem('manaforge_saved_decks');
    if (stored) {
      try { setSavedDecks(JSON.parse(stored)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('manaforge_saved_decks', JSON.stringify(savedDecks));
  }, [savedDecks]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isLiveActive]);

  const showToast = (msg: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSend = async (overrideMsg?: string, overrideFormat?: ArenaFormat) => {
    const msgToUse = overrideMsg || input;
    const formatToUse = overrideFormat || format;
    if (!msgToUse.trim() || isLoading) return;
    setInput('');
    if (!overrideMsg) setMessages(prev => [...prev, { role: 'user', content: `[${formatToUse}] ${msgToUse}` }]);
    setIsLoading(true);

    try {
      const { deck, sources } = await geminiService.generateDeck(msgToUse, formatToUse);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `I've analyzed the multiverse and forged: **${deck.name}**.`,
        deck: deck as Deck,
        sources: sources as any
      }]);

      if (deck) {
        const arenaText = scryfallService.formatForArena(deck as Deck);
        try {
          await navigator.clipboard.writeText(arenaText);
          showToast(`Deck "${deck.name}" forged & copied!`, 'success');
        } catch (err) {
          showToast(`Deck "${deck.name}" forged.`, 'info');
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Alas, a rift in the Blind Eternities occurred." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScout = async () => {
    if (isLoading) return;
    setMessages(prev => [...prev, { role: 'user', content: `Analyze the current ${format} meta.` }]);
    setIsLoading(true);
    try {
      const { data, sources } = await geminiService.scoutMeta(format);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `My sensors are picking up significant shifts in ${format}. Trends:`,
        metaScout: data as MetaScoutData,
        sources: sources as any
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Meta scan failed. The archives are shielded." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveDeck = (deck: Deck, deckFormat: ArenaFormat) => {
    const newSavedDeck: SavedDeck = {
      ...deck,
      id: crypto.randomUUID(),
      format: deckFormat,
      timestamp: Date.now()
    };
    setSavedDecks(prev => [newSavedDeck, ...prev]);
    showToast(`Deck "${deck.name}" bound.`, 'success');
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsLoading(true);
    try {
      const deck = await scryfallService.parseArenaText(importText);
      const newSavedDeck: SavedDeck = { ...deck, id: crypto.randomUUID(), format: format, timestamp: Date.now() };
      setSavedDecks(prev => [newSavedDeck, ...prev]);
      setIsImportOpen(false); setImportText('');
      showToast("Deck successfully imported.", "success");
    } catch (error) {
      showToast("Failed to parse deck.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardSearch = async () => {
    if (!cardSearchQuery.trim()) return;
    setIsLoading(true);
    try {
      const results = await scryfallService.searchCards(cardSearchQuery);
      setCardSearchResults(results);
      if (results.length === 0) showToast("No cards found.", "info");
    } catch (error) {
      showToast("Search failed.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSavedDeck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Exile this deck?")) {
      setSavedDecks(prev => prev.filter(d => d.id !== id));
      showToast("Deck exiled.", "info");
    }
  };

  const loadSavedDeck = (saved: SavedDeck) => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Summoning **${saved.name}** (${saved.format}).`,
      deck: saved
    }]);
    setFormat(saved.format);
    setIsLibraryOpen(false);
  };

  const toggleLiveSession = async () => {
    if (isLiveActive) { stopLiveSession(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsLiveActive(true);
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const pcmBlob = liveService.createBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor); scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              const base64 = message.serverContent.modelTurn.parts[0].inlineData.data;
              nextAudioStartTimeRef.current = Math.max(nextAudioStartTimeRef.current, outputCtx.currentTime);
              const buffer = await liveService.decodeAudioData(liveService.decode(base64), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer; source.connect(outputCtx.destination);
              source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
              source.start(nextAudioStartTimeRef.current);
              nextAudioStartTimeRef.current += buffer.duration; audioSourcesRef.current.add(source);
            }
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'forgeDeck') {
                  const { theme, format: f } = fc.args as any;
                  stopLiveSession(); handleSend(theme, f as ArenaFormat);
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Forging." } } }));
                }
              }
            }
          },
          onclose: () => stopLiveSession(),
          onerror: (e) => stopLiveSession()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `Master MTG assistant. Use forgeDeck for requests. Current format: ${format}.`,
          tools: [{ functionDeclarations: [FORGE_DECK_TOOL] }, { googleSearch: {} }],
          inputAudioTranscription: {}, outputAudioTranscription: {}
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err) { alert("Mic failed."); }
  };

  const stopLiveSession = () => {
    setIsLiveActive(false);
    if (liveSessionRef.current) try { liveSessionRef.current.close(); } catch(e) {}
    if (audioContextsRef.current) { audioContextsRef.current.input.close(); audioContextsRef.current.output.close(); }
  };

  const copyToClipboard = (deckToCopy: Deck) => {
    navigator.clipboard.writeText(scryfallService.formatForArena(deckToCopy));
    showToast("Copied list.", "success");
  };

  const handleCardHover = (e: React.MouseEvent, card: Card) => {
    setHoveredCard(card); setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-[#0d1117]/60 backdrop-blur-md border-x border-[#30363d] shadow-2xl overflow-hidden relative text-[#e6edf3]">
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-widest shadow-2xl animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-green-600/90 border-green-400 text-white' : 
          toast.type === 'error' ? 'bg-red-600/90 border-red-400 text-white' : 'bg-blue-600/90 border-blue-400 text-white'
        }`}>{toast.msg}</div>
      )}

      {hoveredCard && (
        <div className="fixed z-[150] w-64 bg-[#1c2128] border border-[#444c56] rounded-xl shadow-2xl pointer-events-none transition-opacity duration-200 overflow-hidden animate-in fade-in zoom-in-95" style={{ left: Math.min(mousePos.x + 20, window.innerWidth - 280), top: Math.min(mousePos.y + 10, window.innerHeight - 400) }}>
          {(hoveredCard.image_uris?.normal || hoveredCard.card_faces?.[0]?.image_uris?.normal) ? (
            <img src={hoveredCard.image_uris?.normal || hoveredCard.card_faces?.[0]?.image_uris?.normal} className="w-full h-auto border-b border-[#30363d]" />
          ) : (
            <div className="w-full aspect-[2/3] bg-gradient-to-br from-[#161b22] to-[#0d1117] flex items-center justify-center border-b border-[#30363d] text-amber-500/20"><svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
          )}
          <div className="p-3 bg-[#161b22]">
            <div className="flex justify-between items-start gap-2 mb-1">
              <h4 className="text-amber-500 font-bold text-xs">{hoveredCard.name}</h4>
              <ManaCost cost={hoveredCard.mana_cost || hoveredCard.card_faces?.[0]?.mana_cost} size={14} />
            </div>
            <div className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">{hoveredCard.oracle_text || hoveredCard.card_faces?.[0]?.oracle_text}</div>
          </div>
        </div>
      )}

      {/* Codex Overlay */}
      {isCodexOpen && (
        <div className="absolute inset-0 z-[110] bg-black/80 backdrop-blur-xl flex flex-col animate-in slide-in-from-right duration-300">
          <header className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#161b22]">
            <h2 className="text-lg font-bold text-amber-500 flex items-center gap-2 font-[Beleren+Bold]">Card Codex</h2>
            <button onClick={() => setIsCodexOpen(false)} className="p-2 text-gray-400 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </header>
          <div className="p-4 border-b border-gray-800 bg-[#0d1117]">
            <div className="relative">
              <input type="text" value={cardSearchQuery} onChange={(e) => setCardSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCardSearch()} placeholder="Search card..." className="w-full bg-[#161b22] border border-gray-800 rounded-full py-2.5 px-5 text-sm focus:outline-none focus:border-amber-500/50 pr-10 text-white" />
              <button onClick={handleCardSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {cardSearchResults.map(card => (
              <div key={card.name} className="bg-[#1c2128] border border-gray-800 rounded-xl overflow-hidden shadow-lg p-3 flex gap-3 animate-in zoom-in-95 duration-200">
                <img src={card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small} className="w-16 h-auto rounded border border-gray-700 shadow-sm shrink-0" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-1">
                    <h3 className="font-bold text-white text-sm truncate">{card.name}</h3>
                    <ManaCost cost={card.mana_cost || card.card_faces?.[0]?.mana_cost} size={12} />
                  </div>
                  <p className="text-[10px] text-amber-600/80 font-bold uppercase truncate">{card.type_line}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 border-b border-[#30363d]/50 flex flex-col gap-3 bg-[#161b22]/90 backdrop-blur-lg sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="flex gap-[-4px]"><ManaIcon type="W" size={16} /><ManaIcon type="U" size={16} /><ManaIcon type="B" size={16} /><ManaIcon type="R" size={16} /><ManaIcon type="G" size={16} /></div><h1 className="text-xl font-bold text-white font-[Beleren+Bold]">ManaForge</h1></div>
          <div className="flex items-center gap-2">
            <button onClick={handleScout} className={`p-1.5 transition-colors relative ${isLoading ? 'text-amber-500 animate-pulse' : 'text-gray-400 hover:text-amber-500'}`} title="Meta Scout"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a9.5 9.5 0 0113.436 0m-17.678-4.243a13.5 13.5 0 0119.092 0" /></svg></button>
            <button onClick={() => setIsCodexOpen(true)} className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors relative" title="Card Codex"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>
            <button onClick={() => setIsLibraryOpen(true)} className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors relative" title="Grimoire"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <select value={format} onChange={(e) => setFormat(e.target.value as ArenaFormat)} className="flex-1 bg-[#0d1117]/80 border border-[#30363d] text-amber-500 text-[11px] font-bold uppercase tracking-widest rounded-lg px-3 py-2 appearance-none focus:outline-none focus:border-amber-500/50 cursor-pointer transition-all hover:bg-[#1c2128]">
            {['Standard', 'Alchemy', 'Explorer', 'Historic', 'Timeless', 'Brawl'].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="flex items-center gap-1.5 px-3 py-2 bg-green-500/5 border border-green-500/20 rounded-lg"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" /><span className="text-[9px] uppercase font-bold text-green-500/80">Synced</span></div>
        </div>
      </header>

      {/* Main Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-blue-600/90 text-white shadow-lg' : 'bg-[#161b22]/90 border border-[#30363d] text-[#e6edf3]'}`}>
              <div className="text-sm whitespace-pre-wrap leading-relaxed prose prose-invert">{msg.content}</div>
              
              {msg.metaScout && (
                <div className="mt-4 space-y-3">
                  <div className="text-xs text-gray-400 italic bg-black/30 p-3 rounded-xl border border-gray-800 shadow-inner">{msg.metaScout.summary}</div>
                  <div className="grid grid-cols-1 gap-2">
                    {msg.metaScout.archetypes.map((arch, idx) => (
                      <div key={idx} className="bg-[#0d1117] border border-gray-800 rounded-xl p-3 hover:border-amber-500/50 transition-all cursor-pointer group" onClick={() => handleSend(arch.name, format)}>
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="font-bold text-amber-500 group-hover:text-amber-400">{arch.name}</h4>
                          <div className="flex items-center gap-2">
                            {arch.winRate && <span className="text-[9px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded font-mono">{arch.winRate} WR</span>}
                            <span className={`text-[10px] font-bold px-1.5 rounded ${arch.tier === 'S' ? 'bg-red-900/40 text-red-400' : 'bg-gray-800 text-gray-400'}`}>T{arch.tier}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight">{arch.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {msg.deck && (
                <div className="mt-4 bg-[#0d1117]/80 rounded-xl border border-gray-800 p-3 space-y-4 relative overflow-hidden group/deck">
                  <div className="flex justify-between items-center relative z-10">
                    <div><h3 className="font-bold text-amber-500 leading-none">{msg.deck.name}</h3><span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{format}</span></div>
                    <div className="flex gap-2">
                      <button onClick={() => saveDeck(msg.deck!, format)} className="p-1.5 bg-gray-800 hover:bg-gray-700 text-amber-500 rounded-lg border border-gray-700 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg></button>
                      <button onClick={() => copyToClipboard(msg.deck!)} className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg font-bold uppercase transition-all shadow-md">Copy</button>
                    </div>
                  </div>
                  
                  {msg.deck.mechanics && (
                    <div className="flex flex-wrap gap-1.5">
                      {msg.deck.mechanics.map(m => (
                        <span key={m} className="text-[9px] bg-amber-900/30 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter shadow-sm">{m}</span>
                      ))}
                    </div>
                  )}

                  <div className="text-[11px] text-gray-300 italic leading-snug border-l-2 border-amber-900/50 pl-2 py-1 bg-amber-900/10 rounded-r">{msg.deck.explanation}</div>
                  
                  {msg.deck.strategyTips && (
                    <div className="bg-[#161b22]/50 border border-blue-500/10 rounded-xl p-3 space-y-2">
                      <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Strategy Vault
                      </div>
                      <ul className="space-y-1.5">
                        {msg.deck.strategyTips.map((tip, idx) => (
                          <li key={idx} className="text-[10px] text-gray-400 leading-tight pl-3 border-l border-gray-800">{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <ManaCurve deck={msg.deck} />

                  <div className="max-h-64 overflow-y-auto text-[11px] font-mono space-y-1 scrollbar-thin">
                    {msg.deck.commander && (
                      <div className="mb-4 border-b border-amber-600/20 pb-2">
                        <div className="text-[9px] uppercase tracking-wider text-amber-500 font-bold mb-1 ml-1">Commander</div>
                        <div onMouseEnter={(e) => handleCardHover(e, msg.deck!.commander!.card)} className="flex justify-between items-center py-1 px-1 rounded hover:bg-[#1c2128]/50 cursor-help">
                          <span className="text-amber-500 font-bold">{msg.deck.commander.count}</span>
                          <span className="flex-1 px-2 text-white font-bold truncate">{msg.deck.commander.card.name}</span>
                          <ManaCost cost={msg.deck.commander.card.mana_cost} size={12} />
                        </div>
                      </div>
                    )}
                    <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold mb-1 ml-1">Deck</div>
                    {msg.deck.mainboard.map((item, idx) => (
                      <div key={idx} onMouseEnter={(e) => handleCardHover(e, item.card)} className="flex justify-between items-center py-1 px-1 rounded border-b border-gray-900/50 hover:bg-[#1c2128]/50 cursor-help">
                        <span className="text-gray-400 font-bold">{item.count}</span>
                        <span className="flex-1 px-2 text-gray-200 truncate">{item.card.name}</span>
                        <ManaCost cost={item.card.mana_cost} size={12} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 border-t border-gray-800 pt-3 flex flex-wrap gap-2">
                  {msg.sources.map((s: any, idx) => s.web && (
                    <a key={idx} href={s.web.uri} target="_blank" rel="noopener noreferrer" className="text-[9px] bg-blue-900/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-900/40 truncate max-w-[120px]">{s.web.title || "Ref"}</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex justify-start"><div className="bg-[#161b22]/90 border border-[#30363d] p-4 rounded-2xl animate-pulse flex items-center gap-2 backdrop-blur-sm"><div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" /><div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:0.4s]" /><span className="text-xs text-gray-400 ml-2 italic">Scrying Meta...</span></div></div>}
      </div>

      {/* Input */}
      <div className="px-4 py-2 border-t border-[#30363d]/50 bg-[#161b22]/95 backdrop-blur-xl flex items-center gap-3 pb-safe">
        <button onClick={toggleLiveSession} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shrink-0 ${isLiveActive ? 'bg-red-600 text-white border-red-400' : 'bg-red-600/10 text-red-500 border-red-500/20 hover:bg-red-600/20'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></button>
        <div className="flex-1 relative">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={`Forge a ${format} deck...`} className="w-full bg-[#0d1117]/80 border border-[#30363d] rounded-full py-2.5 px-5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors pr-10 text-white" />
          <button onClick={() => handleSend()} disabled={isLoading || !input.trim()} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 disabled:opacity-30"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg></button>
        </div>
      </div>
      <footer className="h-1 bg-gradient-to-r from-[#f8f6d8] via-[#0e68ab] to-[#00733e] flex relative z-10 shrink-0"><div className="h-full bg-[#150b00] w-1/5" /><div className="h-full bg-[#d3202a] w-1/5" /></footer>
    </div>
  );
};

export default App;
