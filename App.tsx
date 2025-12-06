import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_SCRIPT } from './constants';
import { parseDialogue, parseStory } from './utils/parser';
import { ScriptBlock, StoryContext } from './components/VisualRenderer';
import { NodeType, ParsedStory, ScriptNode } from './types';
import { Edit3, Eye, Music4, Users, FileText, Layout, Mic, Sidebar, Wand2, Code, Volume2, Sparkles, Activity } from 'lucide-react';

const COLORS = [
  'bg-red-600 text-white',
  'bg-orange-600 text-white',
  'bg-amber-600 text-white',
  'bg-green-600 text-white',
  'bg-emerald-600 text-white',
  'bg-teal-600 text-white',
  'bg-cyan-600 text-white',
  'bg-sky-600 text-white',
  'bg-blue-600 text-white',
  'bg-indigo-600 text-white',
  'bg-violet-600 text-white',
  'bg-purple-600 text-white',
  'bg-fuchsia-600 text-white',
  'bg-pink-600 text-white',
  'bg-rose-600 text-white',
];

const formatScript = (raw: string): string => {
  // Normalize structural tags to ensure they have newlines around them
  let processed = raw
      .replace(/(<\/?(?:parallel|sequential)(?:[^>]*)?>)/gi, '\n$1\n');

  // Split into lines and process indentation
  const lines = processed.split('\n');
  const result: string[] = [];
  let indent = 0;

  for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
          // If the line is empty, just push it (optional: limit consecutive empty lines)
          if (result.length > 0 && result[result.length - 1] !== '') {
              result.push('');
          }
          continue;
      }

      // Decrease indent for closing tags
      if (/^<\/(parallel|sequential)>$/i.test(trimmed)) {
          indent = Math.max(0, indent - 1);
      }

      // Reset indent for top-level metadata headers
      if (trimmed.match(/^[A-Z_]+:$/)) {
          indent = 0;
      }

      result.push('    '.repeat(indent) + trimmed);

      // Increase indent for opening tags
      if (/^<(parallel|sequential)[^>]*>$/i.test(trimmed)) {
          indent++;
      }
  }

  return result.join('\n');
};

const LINE_HEIGHT = 24;

// Component for Syntax Highlighted Editing
const ScriptEditor = ({ value, onChange, characterColors, onScroll, forwardedRef }: { 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    characterColors: Record<string, string>;
    onScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
    forwardedRef: React.RefObject<HTMLTextAreaElement>;
}) => {
    const preRef = useRef<HTMLPreElement>(null);

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        if (preRef.current) {
            preRef.current.scrollTop = e.currentTarget.scrollTop;
            preRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
        onScroll(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const textarea = e.currentTarget;
            const { selectionStart, selectionEnd, value } = textarea;
            
            const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
            const currentLine = value.substring(lineStart, selectionStart);
            
            const match = currentLine.match(/^(\s*)/);
            let indentation = match ? match[1] : '';

            const trimmedLine = currentLine.trim();
            // Intelligent Indentation
            if (/^<(parallel|sequential)[^>]*>$/i.test(trimmedLine)) {
                indentation += '    ';
            }

            const newValue = value.substring(0, selectionStart) + '\n' + indentation + value.substring(selectionEnd);
            const newCursorPos = selectionStart + 1 + indentation.length;

            // React Synthetic Event Hack
            const event = {
                target: { value: newValue },
                currentTarget: { value: newValue }
            } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
            
            onChange(event);
            
            requestAnimationFrame(() => {
                if (forwardedRef.current) {
                    forwardedRef.current.selectionStart = newCursorPos;
                    forwardedRef.current.selectionEnd = newCursorPos;
                }
            });
        }
    };

    const highlightTags = (text: string) => {
        const parts = text.split(/(<[^>]+>)/g);
        return parts.map((part, i) => {
            if (part.startsWith('<')) {
                 if (part.startsWith('<parallel') || part.startsWith('</parallel')) {
                     return <span key={i} className="text-fuchsia-400 font-mono font-bold opacity-90">{part}</span>;
                 }
                 if (part.startsWith('<sequential') || part.startsWith('</sequential')) {
                     return <span key={i} className="text-cyan-400 font-mono font-bold opacity-90">{part}</span>;
                 }
                 if (part.startsWith('<sound') || part.startsWith('</sound')) {
                     return <span key={i} className="text-emerald-400 font-mono font-bold opacity-80">{part}</span>;
                 }
                 if (part.match(/^<#[0-9.]+#>$/)) {
                     return <span key={i} className="text-yellow-400 font-mono font-bold">{part}</span>;
                 }
                 return <span key={i} className="text-indigo-300 opacity-60">{part}</span>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    const highlightLine = (line: string, index: number) => {
        if (line.length === 0) return <br key={index} style={{ height: `${LINE_HEIGHT}px` }} />;

        const indentationMatch = line.match(/^(\s*)/);
        const indentation = indentationMatch ? indentationMatch[1] : '';

        if (line.match(/^\s*(STORY_TITLE|FINAL_TEXT|CHARACTER_GUIDE|BACKGROUND_MUSIC):/)) {
            return <div key={index} style={{ height: `${LINE_HEIGHT}px` }} className="text-pink-500 font-bold overflow-hidden whitespace-pre">{line}</div>;
        }

        const trimmed = line.trim();
        const dialogueMatch = trimmed.match(/^([^:(<]+)(?:\(([^)]+)\))?:\s*(.*)/);
        
        if (dialogueMatch) {
            const role = dialogueMatch[1].trim();
            const emotion = dialogueMatch[2];
            const content = dialogueMatch[3];

            let roleClass = 'text-slate-200';
            const isNarration = role === 'Narration';
            const knownColorClass = characterColors[role];

            if (isNarration) {
                roleClass = 'text-slate-500 font-bold uppercase text-xs tracking-wider';
            } else if (knownColorClass) {
                const colorNameMatch = knownColorClass.match(/bg-([a-z]+)-600/);
                const colorName = colorNameMatch ? colorNameMatch[1] : 'blue';
                roleClass = `text-${colorName}-400 font-bold`;
            }

            return (
                <div key={index} style={{ height: `${LINE_HEIGHT}px` }} className="overflow-hidden whitespace-pre">
                    <span>{indentation}</span>
                    <span className={roleClass}>{role}</span>
                    {emotion && <span className="text-slate-500 italic text-xs mx-1">({emotion})</span>}
                    <span className="text-slate-600 mr-2">:</span>
                    <span className="text-slate-300">{highlightTags(content)}</span>
                </div>
            );
        }

        return <div key={index} style={{ height: `${LINE_HEIGHT}px` }} className="text-slate-400 overflow-hidden whitespace-pre">{highlightTags(line)}</div>;
    };

    return (
        <div className="relative flex-1 w-full h-full overflow-hidden rounded-lg border border-daw-700 bg-daw-900 shadow-inner group focus-within:border-daw-accent transition-colors">
            <pre 
                ref={preRef}
                className="absolute inset-0 p-6 m-0 font-mono text-sm whitespace-pre pointer-events-none custom-scrollbar overflow-hidden z-0"
                style={{ lineHeight: `${LINE_HEIGHT}px` }}
                aria-hidden="true"
            >
                {value.split('\n').map((line, i) => highlightLine(line, i))}
                <br />
            </pre>

            <textarea
                ref={forwardedRef}
                value={value}
                onChange={onChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                spellCheck={false}
                className="absolute inset-0 w-full h-full p-6 m-0 bg-transparent text-transparent caret-white font-mono text-sm resize-none focus:outline-none z-10 custom-scrollbar selection:bg-daw-accent/30 selection:text-transparent whitespace-pre overflow-y-auto"
                style={{ color: 'transparent', background: 'transparent', lineHeight: `${LINE_HEIGHT}px` }}
            />
        </div>
    );
};

const App = () => {
  const [layout, setLayout] = useState({ showOutline: true, showCode: true, showVisual: true });
  const [content, setContent] = useState(DEFAULT_SCRIPT);
  const [parsedStory, setParsedStory] = useState<ParsedStory | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visualContainerRef = useRef<HTMLDivElement>(null);
  
  // Mutex flags to prevent scroll loops
  const isSyncingCode = useRef(false);
  const isSyncingVisual = useRef(false);

  useEffect(() => {
    try {
      const parsed = parseStory(content);
      setParsedStory(parsed);
    } catch (e) {
      console.error("Failed to parse", e);
    }
  }, [content]);

  const handleAutoFormat = () => {
      const formatted = formatScript(content);
      setContent(formatted);
  };

  // Calculate Statistics
  const stats = useMemo(() => {
      const lineCounts: Record<string, number> = {};
      const soundCounts: Record<string, number> = {};
      const effectCounts: Record<string, number> = {};

      if (!parsedStory) return { lineCounts, soundCounts, effectCounts };

      const traverse = (nodes: ScriptNode[]) => {
          nodes.forEach(node => {
              if (node.type === NodeType.TEXT && node.content) {
                  const { role, voiceEffects } = parseDialogue(node.content);
                  const r = role || 'Unknown';
                  lineCounts[r] = (lineCounts[r] || 0) + 1;

                  if (voiceEffects) {
                      voiceEffects.forEach(e => {
                          const key = e.replace(/[<>]/g, '');
                          effectCounts[key] = (effectCounts[key] || 0) + 1;
                      });
                  }
              } else if (node.type === NodeType.SOUND && node.attributes) {
                  const name = node.attributes.name;
                  soundCounts[name] = (soundCounts[name] || 0) + 1;
              }

              if (node.children) {
                  traverse(node.children);
              }
          });
      };

      traverse(parsedStory.scriptNodes);
      return { lineCounts, soundCounts, effectCounts };
  }, [parsedStory]);

  const characterColors = useMemo(() => {
    const colors: Record<string, string> = {};
    if (!parsedStory) return colors;

    const uniqueRoles = new Set<string>();
    parsedStory.characters.forEach(char => uniqueRoles.add(char.name));
    const traverse = (nodes: ScriptNode[]) => {
      nodes.forEach(node => {
        if (node.type === NodeType.TEXT && node.content) {
          const { role } = parseDialogue(node.content);
          if (role && role.toLowerCase() !== 'narration') {
            uniqueRoles.add(role);
          }
        }
        if (node.children) traverse(node.children);
      });
    };
    traverse(parsedStory.scriptNodes);

    let colorIndex = 0;
    uniqueRoles.forEach(role => {
        if (!colors[role]) {
            colors[role] = COLORS[colorIndex % COLORS.length];
            colorIndex++;
        }
    });
    colors['Narration'] = 'bg-slate-500 text-white';
    return colors;
  }, [parsedStory]);

  const displayCharacters = useMemo(() => {
    if (!parsedStory) return [];
    const explicitChars = parsedStory.characters;
    const explicitNames = new Set(explicitChars.map(c => c.name));
    
    // Use stats to find all roles that actually speak
    const activeRoles = Object.keys(stats.lineCounts);
    
    const detectedNames = activeRoles.filter(
        name => name !== 'Narration' && !explicitNames.has(name)
    );
    
    const inferredChars = detectedNames.map(name => ({
        name,
        rawProfile: '',
        gender: undefined,
        age: undefined,
        personality: undefined,
        voice: 'Detected in script' 
    }));
    
    const allChars = [...explicitChars, ...inferredChars];
    
    // Add Narration if active
    if (stats.lineCounts['Narration'] > 0) {
        // Check if Narration is already in explicit (unlikely but possible)
        if (!explicitNames.has('Narration')) {
             allChars.unshift({
                name: 'Narration',
                rawProfile: '',
                gender: undefined,
                age: undefined,
                personality: undefined,
                voice: 'Narrator'
            });
        }
    }

    return allChars;
  }, [parsedStory, stats]);

  const uniqueRoleCount = Object.keys(stats.lineCounts).length;

  // --- Scroll Synchronization ---

  const handleCodeScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (isSyncingCode.current) {
          isSyncingCode.current = false;
          return;
      }

      if (!layout.showVisual || !visualContainerRef.current) return;

      const scrollTop = e.currentTarget.scrollTop;
      const topLine = Math.floor(scrollTop / LINE_HEIGHT);
      
      const container = visualContainerRef.current;
      const elements = Array.from(container.querySelectorAll('[data-line]')) as HTMLElement[];
      
      let targetEl = elements.find(el => parseInt(el.dataset.line || '0') >= topLine);
      
      if (!targetEl && elements.length > 0) {
          targetEl = elements[elements.length - 1];
      }

      if (targetEl) {
          isSyncingVisual.current = true;
          const offsetTop = targetEl.offsetTop;
          const scrollTarget = Math.max(0, offsetTop - 40);
          container.scrollTo({ top: scrollTarget, behavior: 'auto' });
      }
  };

  const handleVisualScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (isSyncingVisual.current) {
          isSyncingVisual.current = false;
          return;
      }

      if (!layout.showCode || !textareaRef.current) return;

      const container = e.currentTarget;
      const scrollTop = container.scrollTop;
      const elements = Array.from(container.querySelectorAll('[data-line]')) as HTMLElement[];
      
      let activeEl = elements[0];
      let minDistance = Number.MAX_VALUE;

      for (const el of elements) {
          const dist = Math.abs(el.offsetTop - scrollTop);
          if (dist < minDistance) {
              minDistance = dist;
              activeEl = el;
          }
      }

      if (activeEl && activeEl.dataset.line) {
          const line = parseInt(activeEl.dataset.line);
          isSyncingCode.current = true;
          const scrollTarget = line * LINE_HEIGHT;
          textareaRef.current.scrollTo({ top: scrollTarget, behavior: 'auto' });
      }
  };

  return (
    <StoryContext.Provider value={{ characterColors }}>
      <div className="h-screen bg-daw-900 text-slate-300 font-sans selection:bg-daw-accent selection:text-white flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-daw-900 border-b border-daw-800 px-4 py-3 flex items-center justify-between shadow-md z-20 h-16">
          <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-daw-accent to-blue-700 rounded flex items-center justify-center shadow-lg border border-white/10">
                  <Music4 className="text-white w-4 h-4" />
              </div>
              <div className="hidden md:block">
                  <h1 className="text-sm font-bold text-slate-100 leading-none">Sound Rhythm Master</h1>
                  <p className="text-[10px] font-mono text-daw-500 uppercase tracking-widest mt-0.5">Audio Script Visualizer</p>
              </div>
          </div>

          <div className="flex items-center gap-3">
            {layout.showCode && (
                <button
                    onClick={handleAutoFormat}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-daw-400 hover:text-white hover:bg-daw-800 border border-transparent hover:border-daw-700 transition-all mr-2"
                    title="Auto Format Script"
                >
                    <Wand2 size={14} /> <span className="hidden sm:inline">Auto Format</span>
                </button>
            )}

            <div className="flex items-center bg-daw-800 p-1 rounded-lg border border-daw-700">
                <button 
                    onClick={() => setLayout(p => ({ ...p, showOutline: !p.showOutline }))}
                    className={`p-1.5 rounded-md transition-all ${layout.showOutline ? 'text-white' : 'text-daw-500 hover:text-daw-300'}`}
                    title="Toggle Outline"
                >
                    <Sidebar size={16} />
                </button>
                <div className="w-px h-4 bg-daw-700 mx-2"></div>
                <div className="flex bg-daw-900/50 rounded p-0.5 border border-daw-700/50">
                    <button
                        onClick={() => setLayout(p => ({ ...p, showCode: !p.showCode }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        layout.showCode 
                            ? 'bg-daw-accent text-white shadow-sm' 
                            : 'text-daw-500 hover:text-daw-300 hover:bg-daw-800'
                        }`}
                    >
                        <Code size={14} /> <span className="hidden sm:inline">Code</span>
                    </button>
                    <button
                        onClick={() => setLayout(p => ({ ...p, showVisual: !p.showVisual }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        layout.showVisual 
                            ? 'bg-daw-accent text-white shadow-sm' 
                            : 'text-daw-500 hover:text-daw-300 hover:bg-daw-800'
                        }`}
                    >
                        <Eye size={14} /> <span className="hidden sm:inline">Visual</span>
                    </button>
                </div>
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative">
          {/* Outline Sidebar */}
          <aside 
            className={`
               bg-daw-900 border-r border-daw-800 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out flex-shrink-0 h-full
               ${layout.showOutline ? 'w-80 opacity-100' : 'w-0 opacity-0 overflow-hidden'}
            `}
          >
              <div className="p-4 space-y-4 w-80">
                <div className="bg-daw-800 rounded-lg p-4 border border-daw-700">
                    <div className="flex items-center gap-2 text-daw-400 mb-2 text-[10px] uppercase tracking-widest font-bold">
                        <FileText size={12} /> Story Metadata
                    </div>
                    <h2 className="text-lg font-bold text-white mb-2 leading-snug">{parsedStory?.title}</h2>
                    <div className="h-0.5 w-12 bg-daw-accent rounded-full"></div>
                </div>

                {displayCharacters.length > 0 && (
                     <div className="bg-daw-800 rounded-lg border border-daw-700 overflow-hidden">
                        <div className="bg-daw-800 px-4 py-3 border-b border-daw-700 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-daw-400 text-[10px] uppercase tracking-widest font-bold">
                                <Users size={12} /> Cast & Voices
                            </div>
                            <span className="text-[10px] bg-daw-900 px-1.5 py-0.5 rounded text-daw-500">{uniqueRoleCount} Roles</span>
                        </div>
                        <div className="divide-y divide-daw-700/50">
                            {displayCharacters.map((char, idx) => {
                                const colorClass = characterColors[char.name] || 'bg-slate-600';
                                const isDetected = char.voice === 'Detected in script' && !char.age && !char.gender;
                                const isNarration = char.name === 'Narration';
                                const lineCount = stats.lineCounts[char.name] || 0;

                                return (
                                    <div key={idx} className="p-4 hover:bg-daw-700/20 transition-colors">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className={`w-8 h-8 rounded ${colorClass} flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm ${isNarration ? 'opacity-80' : ''}`}>
                                                {char.name.substring(0, 1)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-bold text-sm text-slate-200 truncate pr-2">{char.name}</h3>
                                                    <span className="text-[10px] bg-daw-950/50 text-daw-500 px-1.5 py-0.5 rounded border border-daw-800/50 flex-shrink-0 font-mono" title="Lines of dialogue">
                                                        {lineCount}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pl-11 space-y-1">
                                            {char.gender && <div className="text-xs text-daw-300"><span className="text-[9px] text-daw-500 uppercase tracking-widest w-12 inline-block">Gender</span>{char.gender}</div>}
                                            {char.age && <div className="text-xs text-daw-300"><span className="text-[9px] text-daw-500 uppercase tracking-widest w-12 inline-block">Age</span>{char.age}</div>}
                                            {char.voice && (
                                                <div className={`mt-2 text-xs p-2 rounded border leading-relaxed ${isDetected || isNarration ? 'bg-daw-900/40 text-daw-500 border-dashed border-daw-700/50 flex items-center gap-2' : 'text-indigo-200/80 bg-indigo-950/20 border-indigo-500/10 italic'}`}>
                                                    {(isDetected || isNarration) && <Mic size={10} />} "{char.voice}"
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Sound & Effects Stats */}
                {(Object.keys(stats.soundCounts).length > 0 || Object.keys(stats.effectCounts).length > 0) && (
                    <div className="bg-daw-800 rounded-lg border border-daw-700 overflow-hidden">
                        <div className="bg-daw-800 px-4 py-3 border-b border-daw-700 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-daw-400 text-[10px] uppercase tracking-widest font-bold">
                                <Activity size={12} /> Production FX
                            </div>
                        </div>
                        
                        {Object.keys(stats.soundCounts).length > 0 && (
                            <div className="p-3 border-b border-daw-700/50">
                                <div className="text-[10px] font-bold text-daw-500 uppercase mb-2 flex items-center gap-1.5 opacity-80">
                                    <Volume2 size={10} /> Sound Effects
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(stats.soundCounts).sort((a,b) => b[1] - a[1]).map(([name, count], i) => (
                                        <div key={i} className="flex items-center gap-1.5 bg-daw-900/50 px-2 py-1 rounded border border-daw-700/50 text-xs text-slate-300 hover:bg-daw-900 transition-colors cursor-default">
                                            <span>{name}</span>
                                            <span className="text-daw-500 text-[10px] font-mono border-l border-daw-700/50 pl-1.5 ml-0.5">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {Object.keys(stats.effectCounts).length > 0 && (
                            <div className="p-3">
                                <div className="text-[10px] font-bold text-daw-500 uppercase mb-2 flex items-center gap-1.5 opacity-80">
                                    <Sparkles size={10} /> Voice Filters
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(stats.effectCounts).sort((a,b) => b[1] - a[1]).map(([name, count], i) => (
                                        <div key={i} className="flex items-center gap-1.5 bg-indigo-950/30 px-2 py-1 rounded border border-indigo-500/20 text-xs text-indigo-200 hover:bg-indigo-950/50 transition-colors cursor-default">
                                            <span>{name}</span>
                                            <span className="text-indigo-400/70 text-[10px] font-mono border-l border-indigo-500/20 pl-1.5 ml-0.5">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {parsedStory?.backgroundMusic && (
                     <div className="bg-gradient-to-br from-indigo-900/20 to-daw-800 rounded-lg p-4 border border-indigo-500/10">
                        <div className="flex items-center gap-2 text-indigo-400 mb-3 text-[10px] uppercase tracking-widest font-bold"><Music4 size={12} /> Music Direction</div>
                        <pre className="whitespace-pre-wrap font-sans text-xs text-indigo-200/60 leading-relaxed">{parsedStory.backgroundMusic}</pre>
                    </div>
                )}
              </div>
          </aside>

          {/* Main Content Area - Split View */}
          <section className="flex-1 flex overflow-hidden bg-daw-950 relative h-full">
            
            {/* Code View */}
            {layout.showCode && (
                <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 min-w-0 ${layout.showVisual ? 'border-r border-daw-800' : ''}`}>
                    <div className="bg-daw-900/50 px-4 py-2 border-b border-daw-800/50 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-daw-500 uppercase tracking-widest flex items-center gap-2">
                           <Code size={12} /> Code Editor
                        </span>
                    </div>
                    <div className="flex-1 overflow-hidden p-4 relative min-h-0">
                        <ScriptEditor 
                            value={content} 
                            onChange={(e) => setContent(e.target.value)} 
                            characterColors={characterColors}
                            onScroll={handleCodeScroll}
                            forwardedRef={textareaRef}
                        />
                    </div>
                </div>
            )}

            {/* Visual View */}
            {layout.showVisual && (
                 <div 
                    ref={visualContainerRef}
                    onScroll={handleVisualScroll}
                    className="flex-1 h-full overflow-y-auto custom-scrollbar bg-daw-950 min-w-0 relative"
                 >
                     <div className="bg-daw-900 rounded-lg border border-daw-800 shadow-xl overflow-hidden min-h-full m-2 md:m-4 relative">
                         {/* Timeline Header */}
                         <div className="bg-daw-900/95 border-b border-daw-800 px-4 py-2 flex justify-between items-center sticky top-0 z-20 backdrop-blur-md">
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-mono text-daw-500 uppercase tracking-widest flex items-center gap-2">
                                     <Eye size={12} /> Visual Preview
                                 </span>
                                 <div className="h-3 w-px bg-daw-800"></div>
                                 <div className="flex -space-x-1.5">
                                     {Object.keys(characterColors).slice(0, 5).filter(n => n !== 'Narration').map((name, i) => (
                                         <div key={i} className={`w-5 h-5 rounded border border-daw-900 ${characterColors[name]} flex items-center justify-center text-[7px] font-bold`} title={name}>{name[0]}</div>
                                     ))}
                                 </div>
                             </div>
                         </div>
                         
                         {/* Script Content */}
                         <div className="p-4 md:p-6 lg:p-10 relative">
                            {/* Visual Representation of Title */}
                            {parsedStory?.title && (
                                <div className="mb-8 p-6 bg-daw-800/50 rounded-xl border border-daw-700/50 text-center" data-line={parsedStory.titleLine}>
                                    <h1 className="text-3xl font-bold text-slate-100 mb-2">{parsedStory.title}</h1>
                                    <div className="text-[10px] font-mono text-daw-500 uppercase tracking-widest">Story Title</div>
                                </div>
                            )}

                            {/* Script Nodes */}
                            {parsedStory?.scriptNodes.map(node => (
                                <div key={node.id} data-line={node.lineNumber}>
                                    <ScriptBlock node={node} />
                                </div>
                            ))}

                            <div className="my-16 border-t border-daw-800/50"></div>

                            {/* Visual Representation of Metadata Sections */}
                            {parsedStory?.characters.length > 0 && parsedStory.guideLine && (
                                <div className="mb-8 p-6 bg-daw-800/50 rounded-xl border border-daw-700/50" data-line={parsedStory.guideLine}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Users className="text-daw-400" size={16} />
                                        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Character Guide</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {parsedStory.characters.map((char, i) => (
                                            <div key={i} className="bg-daw-900 p-3 rounded-lg border border-daw-700/50 text-xs">
                                                <div className="font-bold text-slate-200 mb-1">{char.name}</div>
                                                <div className="text-daw-400">{char.voice || 'No voice specified'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {parsedStory?.backgroundMusic && parsedStory.musicLine && (
                                <div className="mb-8 p-6 bg-gradient-to-br from-indigo-900/10 to-daw-800 rounded-xl border border-indigo-500/10" data-line={parsedStory.musicLine}>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Music4 className="text-indigo-400" size={16} />
                                        <h3 className="text-sm font-bold text-indigo-200 uppercase tracking-wide">Background Music</h3>
                                    </div>
                                    <pre className="font-sans text-sm text-indigo-200/80 leading-relaxed whitespace-pre-wrap">
                                        {parsedStory.backgroundMusic}
                                    </pre>
                                </div>
                            )}

                            <div className="mt-8 pt-8 text-center opacity-40 pb-20">
                                <p className="text-daw-600 text-[10px] font-mono tracking-[0.5em] uppercase">End of Script</p>
                            </div>
                         </div>
                     </div>
                 </div>
            )}
          </section>
        </main>
      </div>
    </StoryContext.Provider>
  );
};

export default App;