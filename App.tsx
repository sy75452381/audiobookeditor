import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DEFAULT_SCRIPT } from './constants';
import { parseDialogue, parseStory } from './utils/parser';
import { ScriptBlock, StoryContext } from './components/VisualRenderer';
import { NodeType, ParsedStory, ScriptNode } from './types';
import { Edit3, Eye, Music4, Users, FileText, Layout, Mic, Sidebar, Wand2, Code, Volume2, Sparkles, Activity, X, Zap, Brain, ChevronRight, Check, Play, Pause, RotateCcw, Loader2, ChevronDown, ChevronUp, FlaskConical, Layers } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

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
  // We replace tags with surrounded newlines, but then we filter out empty lines to compact it.
  let processed = raw
      .replace(/(\s*)(<\/?(?:parallel|sequential)(?:[^>]*)?>)(\s*)/gi, '\n$2\n');

  // Split into lines and process indentation
  const lines = processed.split('\n');
  const result: string[] = [];
  let indent = 0;

  for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

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
        const textarea = e.currentTarget;

        // Shortcuts for wrapping: Alt+S (Sequential) and Alt+P (Parallel)
        if (e.altKey && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'p')) {
            e.preventDefault();
            const value = textarea.value;
            const selStart = textarea.selectionStart;
            const selEnd = textarea.selectionEnd;

            // Determine start of the first line involved
            const startLineIndex = value.lastIndexOf('\n', selStart - 1) + 1;
            
            // Determine end of the last line involved
            let endSearchPos = selEnd;
            // If selection ends exactly at the start of a line (e.g. includes previous newline), 
            // adjust to not include the next line.
            if (selEnd > selStart && value[selEnd - 1] === '\n') {
                endSearchPos = selEnd - 1;
            }
            
            let endLineIndex = value.indexOf('\n', endSearchPos);
            if (endLineIndex === -1) endLineIndex = value.length;

            const textToWrap = value.substring(startLineIndex, endLineIndex);
            
            // Calculate base indentation from the first line to maintain structure
            const match = textToWrap.match(/^(\s*)/);
            const baseIndent = match ? match[1] : '';
            
            const tag = e.key.toLowerCase() === 'p' ? 'parallel' : 'sequential';
            
            // Indent inner content
            const indentedContent = textToWrap.split('\n').map(line => {
                if (!line.trim()) return line;
                return '    ' + line;
            }).join('\n');

            const newBlock = `${baseIndent}<${tag}>\n${indentedContent}\n${baseIndent}</${tag}>`;
            
            // Use execCommand to insert text and preserve undo history
            textarea.focus();
            textarea.setSelectionRange(startLineIndex, endLineIndex);
            document.execCommand('insertText', false, newBlock);
            
            return;
        }

        // Shortcut for removing surrounding tags: Alt+R
        if (e.altKey && e.key.toLowerCase() === 'r') {
            e.preventDefault();
            const value = textarea.value;
            const selectionStart = textarea.selectionStart;

            // Split into lines for analysis
            const lines = value.split('\n');
            const cursorLineIndex = value.substring(0, selectionStart).split('\n').length - 1;

            // 1. Find Start Line (Opening Tag) - Scanning backwards
            let startLineIndex = -1;
            let tagType = '';
            let balance = 0;

            for (let i = cursorLineIndex; i >= 0; i--) {
                const line = lines[i].trim();
                const openMatch = line.match(/^<(parallel|sequential)(?:[^>]*)>$/i);
                const closeMatch = line.match(/^<\/(parallel|sequential)>$/i);

                if (closeMatch) {
                    balance++;
                } else if (openMatch) {
                    if (balance > 0) {
                        balance--;
                    } else {
                        startLineIndex = i;
                        tagType = openMatch[1].toLowerCase();
                        break;
                    }
                }
            }

            if (startLineIndex === -1) return; // No enclosing block found

            // 2. Find End Line (Closing Tag) - Scanning forwards from start
            let endLineIndex = -1;
            let depth = 0;

            for (let j = startLineIndex; j < lines.length; j++) {
                const line = lines[j].trim();
                const openMatch = line.match(new RegExp(`^<${tagType}(?:[^>]*)>$`, 'i'));
                const closeMatch = line.match(new RegExp(`^</${tagType}>$`, 'i'));

                if (openMatch) {
                    depth++;
                } else if (closeMatch) {
                    depth--;
                }

                if (depth === 0) {
                    endLineIndex = j;
                    break;
                }
            }

            if (endLineIndex === -1) return; // Malformed block

            // 3. Construct Replacement Content
            // Extract inner lines (excluding the tags)
            const innerLines = lines.slice(startLineIndex + 1, endLineIndex);
            
            // Un-indent logic: Remove up to 4 spaces from the start of each line
            const processedLines = innerLines.map(line => line.replace(/^ {1,4}/, ''));
            const replacementText = processedLines.join('\n');

            // 4. Calculate Character Indices for Replacement
            // We need to replace the range covering the full lines from startLineIndex to endLineIndex
            
            // Reconstruct the text block that is being replaced to get exact length
            const textToReplace = lines.slice(startLineIndex, endLineIndex + 1).join('\n');
            
            // Calculate start index by summing lengths of preceding lines
            let startIndex = 0;
            for (let k = 0; k < startLineIndex; k++) {
                startIndex += lines[k].length + 1; // +1 for the newline char
            }
            
            const endIndex = startIndex + textToReplace.length;

            // 5. Execute Replacement
            textarea.focus();
            textarea.setSelectionRange(startIndex, endIndex);
            document.execCommand('insertText', false, replacementText);
            
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const { selectionStart, value } = textarea;
            
            const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
            const currentLine = value.substring(lineStart, selectionStart);
            
            const match = currentLine.match(/^(\s*)/);
            let indentation = match ? match[1] : '';

            const trimmedLine = currentLine.trim();
            // Intelligent Indentation
            if (/^<(parallel|sequential)[^>]*>$/i.test(trimmedLine)) {
                indentation += '    ';
            }

            // Use execCommand to insert text and preserve undo history
            document.execCommand('insertText', false, '\n' + indentation);
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

        if (line.match(/^\s*(STORY_TITLE|FINAL_TEXT|CHARACTER_GUIDE|BACKGROUND_MUSIC|ENHANCED_TEXT):/)) {
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

const extractSection = (text: string, startTag: string, endTags: string[]): string => {
    const startIndex = text.indexOf(startTag);
    if (startIndex === -1) return '';
    
    const contentStart = startIndex + startTag.length;
    let endIndex = text.length;
    
    for (const tag of endTags) {
        const tagIndex = text.indexOf(tag, contentStart);
        if (tagIndex !== -1 && tagIndex < endIndex) {
            endIndex = tagIndex;
        }
    }
    
    return text.substring(contentStart, endIndex).trim();
};

const App = () => {
  const [layout, setLayout] = useState({ showOutline: true, showCode: true, showVisual: true });
  const [content, setContent] = useState(DEFAULT_SCRIPT);
  const [parsedStory, setParsedStory] = useState<ParsedStory | null>(null);
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  
  // AI Import State
  const [importMode, setImportMode] = useState<'pro' | 'preview' | 'fast'>('pro');
  const [generatedContent, setGeneratedContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [streamStatus, setStreamStatus] = useState<'idle' | 'streaming' | 'done'>('idle');
  const [generationStep, setGenerationStep] = useState<'idle' | 'step1' | 'step2'>('idle');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  
  // Prompts
  const [storyParsePrompt, setStoryParsePrompt] = useState('');
  const [step1Prompt, setStep1Prompt] = useState('');
  const [step2Prompt, setStep2Prompt] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visualContainerRef = useRef<HTMLDivElement>(null);
  const importOutputRef = useRef<HTMLTextAreaElement>(null);
  const thinkingOutputRef = useRef<HTMLTextAreaElement>(null);
  
  // Mutex flags to prevent scroll loops
  const isSyncingCode = useRef(false);
  const isSyncingVisual = useRef(false);

  useEffect(() => {
    fetch('components/StoryParsePrompt.txt')
        .then(res => res.ok ? res.text() : Promise.reject())
        .then(setStoryParsePrompt)
        .catch(console.error);
        
    fetch('components/step1.txt')
        .then(res => res.ok ? res.text() : Promise.reject())
        .then(setStep1Prompt)
        .catch(console.error);

    fetch('components/step2.txt')
        .then(res => res.ok ? res.text() : Promise.reject())
        .then(setStep2Prompt)
        .catch(console.error);
  }, []);

  useEffect(() => {
    try {
      const parsed = parseStory(content);
      setParsedStory(parsed);
    } catch (e) {
      console.error("Failed to parse", e);
    }
  }, [content]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (streamStatus === 'streaming') {
        if (generationStep === 'step1' || generationStep === 'idle') setElapsedTime(0);
        interval = setInterval(() => {
            setElapsedTime(prev => prev + 0.1);
        }, 100);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [streamStatus, generationStep]);

  // Auto-scroll outputs
  useEffect(() => {
    if (streamStatus === 'streaming' && importOutputRef.current) {
        importOutputRef.current.scrollTop = importOutputRef.current.scrollHeight;
    }
  }, [generatedContent, streamStatus]);

  useEffect(() => {
    if (streamStatus === 'streaming' && thinkingOutputRef.current) {
        thinkingOutputRef.current.scrollTop = thinkingOutputRef.current.scrollHeight;
    }
  }, [thinkingContent, streamStatus]);

  // Auto-collapse thinking when output starts
  useEffect(() => {
      if (generatedContent.length > 50 && isThinkingExpanded) {
          setIsThinkingExpanded(false);
      }
  }, [generatedContent, isThinkingExpanded]);

  const handleAutoFormat = () => {
      const formatted = formatScript(content);
      setContent(formatted);
  };

  const handleAiImport = async () => {
      if (!importText.trim()) return;
      if (!storyParsePrompt) {
          alert("Prompt not loaded yet. Please wait a moment.");
          return;
      }
      
      setStreamStatus('streaming');
      setGenerationStep('idle');
      setGeneratedContent('');
      setThinkingContent('');
      setElapsedTime(0);
      setIsThinkingExpanded(true);
      
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          let modelName = 'gemini-2.5-pro'; 
          if (importMode === 'preview') modelName = 'gemini-3-pro-preview';
          if (importMode === 'fast') modelName = 'gemini-flash-latest';
          
          const config = { 
              thinkingConfig: { 
                  thinkingBudget: -1,
                  includeThoughts: true 
              } 
          };
          
          const responseStream = await ai.models.generateContentStream({
              model: modelName,
              contents: storyParsePrompt + importText,
              config: config
          });
          
          for await (const chunk of responseStream) {
             const parts = chunk.candidates?.[0]?.content?.parts;
             if (parts) {
                 for (const part of parts) {
                     const p = part as any;
                     if (!p.text) continue;
                     if (p.thought) {
                         setThinkingContent(prev => prev + p.text);
                     } else {
                         setGeneratedContent(prev => prev + p.text);
                     }
                 }
             }
          }
          setStreamStatus('done');
      } catch (e) {
          console.error(e);
          alert('Generation failed. Please try again.');
          setStreamStatus('idle');
      }
  }

  const handleAiImportTwoSteps = async () => {
      if (!importText.trim()) return;
      if (!step1Prompt || !step2Prompt) {
          alert("2-Step Prompts not loaded yet. Please wait.");
          return;
      }

      setStreamStatus('streaming');
      setGenerationStep('step1');
      setGeneratedContent('');
      setThinkingContent('');
      setElapsedTime(0);
      setIsThinkingExpanded(true);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let modelName = 'gemini-2.5-pro'; 
      if (importMode === 'preview') modelName = 'gemini-3-pro-preview';
      if (importMode === 'fast') modelName = 'gemini-flash-latest';
      
      const config = { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } };

      // Step 1: Structure
      let step1Output = "";
      try {
          const stream1 = await ai.models.generateContentStream({
              model: modelName,
              contents: step1Prompt + importText,
              config
          });

          for await (const chunk of stream1) {
              const parts = chunk.candidates?.[0]?.content?.parts;
              if (parts) {
                  for (const part of parts) {
                      const p = part as any;
                      if (!p.text) continue;
                      if (p.thought) setThinkingContent(prev => prev + p.text);
                      else {
                          step1Output += p.text;
                          setGeneratedContent(prev => prev + p.text);
                      }
                  }
              }
          }
      } catch (e) {
          console.error(e);
          alert('Step 1 failed.');
          setStreamStatus('idle');
          setGenerationStep('idle');
          return;
      }

      // Parse Step 1
      const title = extractSection(step1Output, 'STORY_TITLE:', ['FINAL_TEXT:', 'CHARACTER_GUIDE:', 'BACKGROUND_MUSIC:']);
      const basicText = extractSection(step1Output, 'FINAL_TEXT:', ['CHARACTER_GUIDE:', 'BACKGROUND_MUSIC:', 'STORY_TITLE:']);
      const charGuide = extractSection(step1Output, 'CHARACTER_GUIDE:', ['BACKGROUND_MUSIC:', 'FINAL_TEXT:']);
      const bgMusic = extractSection(step1Output, 'BACKGROUND_MUSIC:', []);

      if (!basicText) {
          alert("Failed to parse structure from Step 1. Stopping.");
          setStreamStatus('done'); // Allow user to see partial output
          setGenerationStep('idle');
          return;
      }

      // Step 2: Enhancement
      setGenerationStep('step2');
      setThinkingContent(''); 
      setGeneratedContent(''); // Clear to show Step 2 stream
      
      let step2Output = "";
      try {
           const stream2 = await ai.models.generateContentStream({
              model: modelName,
              contents: step2Prompt + "\n\n**FORMATTED STORY TEXT:**\n" + basicText,
              config
          });

          for await (const chunk of stream2) {
              const parts = chunk.candidates?.[0]?.content?.parts;
              if (parts) {
                  for (const part of parts) {
                      const p = part as any;
                      if (!p.text) continue;
                      if (p.thought) setThinkingContent(prev => prev + p.text);
                      else {
                          step2Output += p.text;
                          setGeneratedContent(prev => prev + p.text);
                      }
                  }
              }
          }
      } catch (e) {
          console.error(e);
          alert('Step 2 failed.');
          setStreamStatus('idle');
          setGenerationStep('idle');
          return;
      }

      // Final Assembly
      const enhancedText = extractSection(step2Output, 'ENHANCED_TEXT:', []);
      // If Step 2 failed to produce header, fallback to full output (cleanup required)
      const finalTextBody = enhancedText || step2Output;

      const finalOutput = `STORY_TITLE:\n${title}\n\nFINAL_TEXT:\n${title}\n${finalTextBody}\n\nCHARACTER_GUIDE:\n${charGuide}\n\nBACKGROUND_MUSIC:\n${bgMusic}`;
      
      setGeneratedContent(finalOutput);
      setStreamStatus('done');
      setGenerationStep('idle');
  };
  
  const applyImport = () => {
      if (generatedContent) {
          setContent(generatedContent);
          setShowImportModal(false);
          // Reset state for next time
          setImportText('');
          setGeneratedContent('');
          setThinkingContent('');
          setStreamStatus('idle');
          setGenerationStep('idle');
      }
  }
  
  const resetImport = () => {
      setStreamStatus('idle');
      setGenerationStep('idle');
      setGeneratedContent('');
      setThinkingContent('');
  }

  // Calculate Statistics (Existing Code)
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
  // (Scroll handlers remain unchanged)
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
            <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-daw-400 hover:text-white hover:bg-daw-800 border border-transparent hover:border-daw-700 transition-all mr-2"
                title="AI Story Import"
            >
                <Sparkles size={14} className="text-purple-400" /> <span className="hidden sm:inline">AI Import</span>
            </button>
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

        {/* Main Content (Unchanged) */}
        <main className="flex-1 flex overflow-hidden relative">
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
                                    {Object.entries(stats.soundCounts).sort((a,b) => (b[1] as number) - (a[1] as number)).map(([name, count], i) => (
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
                                    {Object.entries(stats.effectCounts).sort((a,b) => (b[1] as number) - (a[1] as number)).map(([name, count], i) => (
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

          <section className="flex-1 flex overflow-hidden bg-daw-950 relative h-full">
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

            {layout.showVisual && (
                 <div 
                    ref={visualContainerRef}
                    onScroll={handleVisualScroll}
                    className="flex-1 h-full overflow-y-auto custom-scrollbar bg-daw-950 min-w-0 relative"
                 >
                     <div className="bg-daw-900 rounded-lg border border-daw-800 shadow-xl overflow-hidden min-h-full m-2 md:m-4 relative">
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
                         
                         <div className="p-4 md:p-6 lg:p-10 relative">
                            {parsedStory?.title && (
                                <div className="mb-8 p-6 bg-daw-800/50 rounded-xl border border-daw-700/50 text-center" data-line={parsedStory.titleLine}>
                                    <h1 className="text-3xl font-bold text-slate-100 mb-2">{parsedStory.title}</h1>
                                    <div className="text-[10px] font-mono text-daw-500 uppercase tracking-widest">Story Title</div>
                                </div>
                            )}

                            {parsedStory?.scriptNodes.map(node => (
                                <div key={node.id} data-line={node.lineNumber}>
                                    <ScriptBlock node={node} />
                                </div>
                            ))}

                            <div className="my-16 border-t border-daw-800/50"></div>

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
        
        {/* AI Import Modal */}
        {showImportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
                <div className="bg-daw-900 border border-daw-700 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col h-[90vh] overflow-hidden relative">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-daw-800 bg-daw-900/95 backdrop-blur-sm z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-lg border border-purple-500/30">
                                <Sparkles className="text-purple-400" size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white leading-tight">AI Story Import</h2>
                                <p className="text-[10px] text-daw-400 uppercase tracking-widest font-medium flex items-center gap-2">
                                    {streamStatus === 'idle' ? 'Configuration' : 
                                     generationStep === 'step1' ? 'Processing Step 1/2: Structure' : 
                                     generationStep === 'step2' ? 'Processing Step 2/2: Enhancement' :
                                     streamStatus === 'streaming' ? 'Generating Script' : 'Review & Import'}
                                </p>
                            </div>
                        </div>
                        {streamStatus !== 'streaming' && (
                            <button onClick={() => setShowImportModal(false)} className="text-daw-400 hover:text-white p-2 hover:bg-daw-800 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                    
                    {/* Modal Content */}
                    <div className="flex-1 overflow-hidden flex flex-col bg-daw-950 relative">
                        {streamStatus === 'idle' ? (
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Model Selection */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Pro Mode: Gemini 2.5 Pro */}
                                    <button 
                                        onClick={() => setImportMode('pro')}
                                        className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 group ${
                                            importMode === 'pro' 
                                            ? 'bg-purple-950/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]' 
                                            : 'bg-daw-900/50 border-daw-800 hover:border-daw-700 hover:bg-daw-900'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className={`p-2 rounded-lg ${importMode === 'pro' ? 'bg-purple-500 text-white' : 'bg-daw-800 text-daw-400'}`}>
                                                <Brain size={20} />
                                            </div>
                                            {importMode === 'pro' && <div className="text-purple-400"><Check size={18} /></div>}
                                        </div>
                                        <h3 className={`font-bold mb-1 ${importMode === 'pro' ? 'text-white' : 'text-slate-300'}`}>Pro Mode</h3>
                                        <p className="text-xs text-daw-400 leading-relaxed">Gemini 2.5 Pro. Stable, high intelligence. Best for complex scripts.</p>
                                    </button>

                                    {/* Tech Preview: Gemini 3 Pro Preview */}
                                    <button 
                                        onClick={() => setImportMode('preview')}
                                        className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 group ${
                                            importMode === 'preview' 
                                            ? 'bg-blue-950/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]' 
                                            : 'bg-daw-900/50 border-daw-800 hover:border-daw-700 hover:bg-daw-900'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className={`p-2 rounded-lg ${importMode === 'preview' ? 'bg-blue-500 text-white' : 'bg-daw-800 text-daw-400'}`}>
                                                <FlaskConical size={20} />
                                            </div>
                                            {importMode === 'preview' && <div className="text-blue-400"><Check size={18} /></div>}
                                        </div>
                                        <h3 className={`font-bold mb-1 ${importMode === 'preview' ? 'text-white' : 'text-slate-300'}`}>Tech Preview</h3>
                                        <p className="text-xs text-daw-400 leading-relaxed">Gemini 3 Pro Preview. Bleeding edge reasoning. Tech preview for testing.</p>
                                    </button>

                                    {/* Fast Mode: Gemini 2.5 Flash */}
                                    <button 
                                        onClick={() => setImportMode('fast')}
                                        className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 group ${
                                            importMode === 'fast' 
                                            ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]' 
                                            : 'bg-daw-900/50 border-daw-800 hover:border-daw-700 hover:bg-daw-900'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className={`p-2 rounded-lg ${importMode === 'fast' ? 'bg-amber-500 text-white' : 'bg-daw-800 text-daw-400'}`}>
                                                <Zap size={20} />
                                            </div>
                                            {importMode === 'fast' && <div className="text-amber-400"><Check size={18} /></div>}
                                        </div>
                                        <h3 className={`font-bold mb-1 ${importMode === 'fast' ? 'text-white' : 'text-slate-300'}`}>Fast Mode</h3>
                                        <p className="text-xs text-daw-400 leading-relaxed">Gemini Flash 2.5. High speed, lower cost. Good for simple drafts.</p>
                                    </button>
                                </div>

                                {/* Text Input */}
                                <div className="flex-1 flex flex-col">
                                    <label className="text-xs font-bold text-daw-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <FileText size={14} /> Raw Story Text
                                    </label>
                                    <textarea
                                        value={importText}
                                        onChange={(e) => setImportText(e.target.value)}
                                        placeholder="Paste your story content here. The AI will automatically parse characters, format dialogue, and add sound effects..."
                                        className="flex-1 min-h-[360px] w-full bg-daw-900 border border-daw-800 rounded-xl p-4 text-sm text-slate-300 focus:outline-none focus:border-daw-accent/50 focus:ring-1 focus:ring-daw-accent/50 resize-none custom-scrollbar transition-all placeholder:text-daw-600"
                                    />
                                </div>
                            </div>
                        ) : (
                            // Streaming / Review View
                            <div className="flex-1 flex flex-col relative overflow-hidden">
                                {streamStatus === 'streaming' && (
                                    <div className="absolute top-0 left-0 right-0 h-1 bg-daw-800 z-20">
                                        <div className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 animate-gradient-x w-[200%]"></div>
                                    </div>
                                )}
                                
                                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                                    {/* Thinking Section */}
                                    <div className={`border-b border-daw-800 bg-daw-900/50 transition-all duration-300 ${isThinkingExpanded ? 'flex-[0_0_auto]' : 'flex-none'}`}>
                                        <button 
                                            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                                            className="w-full px-4 py-2 flex justify-between items-center text-xs hover:bg-daw-800/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 text-daw-400 font-mono">
                                                <Brain size={14} className={streamStatus === 'streaming' && !generatedContent ? "animate-pulse text-purple-400" : ""} />
                                                <span>THINKING_PROCESS</span>
                                                {streamStatus === 'streaming' && !generatedContent && (
                                                    <span className="text-purple-400 ml-2">({elapsedTime.toFixed(1)}s)</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-daw-500">
                                                {thinkingContent && <span className="text-[10px]">{thinkingContent.length} chars</span>}
                                                {isThinkingExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </div>
                                        </button>
                                        
                                        {isThinkingExpanded && (
                                            <div className="relative border-t border-daw-800/50 min-h-[120px] max-h-[40vh] bg-black/20 overflow-hidden flex flex-col">
                                                <textarea
                                                    ref={thinkingOutputRef}
                                                    value={thinkingContent}
                                                    readOnly
                                                    className="flex-1 w-full bg-transparent p-4 text-xs font-mono text-daw-400 leading-relaxed focus:outline-none resize-none custom-scrollbar"
                                                    placeholder={streamStatus === 'streaming' ? "Waiting for thought stream..." : "Thinking process log."}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Output Section */}
                                    <div className="flex-1 flex flex-col bg-daw-950 min-h-[300px]">
                                        <div className="px-4 py-2 bg-daw-900/30 border-b border-daw-800 flex justify-between items-center text-xs sticky top-0 z-10 backdrop-blur-sm">
                                            <div className="flex items-center gap-2 font-mono text-daw-500">
                                                <FileText size={14} />
                                                <span>{generationStep !== 'idle' ? `GENERATED_OUTPUT (${generationStep.toUpperCase()})` : 'GENERATED_SCRIPT'}</span>
                                            </div>
                                            {streamStatus === 'streaming' && generatedContent && (
                                                <span className="flex items-center gap-2 text-emerald-400 animate-pulse font-mono">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    WRITING
                                                </span>
                                            )}
                                        </div>
                                        <textarea
                                            ref={importOutputRef}
                                            value={generatedContent}
                                            readOnly={streamStatus === 'streaming'}
                                            onChange={(e) => setGeneratedContent(e.target.value)}
                                            className="flex-1 w-full bg-daw-950 p-6 text-sm font-mono text-emerald-100/90 leading-relaxed focus:outline-none resize-none custom-scrollbar selection:bg-emerald-500/30"
                                            placeholder="Generated script will appear here..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Modal Footer */}
                    <div className="p-4 border-t border-daw-800 bg-daw-900 flex justify-end gap-3 z-10">
                        {streamStatus === 'idle' ? (
                            <>
                                <button 
                                    onClick={() => setShowImportModal(false)}
                                    className="px-5 py-2.5 rounded-lg text-sm font-medium text-daw-400 hover:text-white hover:bg-daw-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAiImportTwoSteps}
                                    disabled={!importText.trim()}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all ${
                                        !importText.trim() 
                                        ? 'bg-daw-800 text-daw-500 cursor-not-allowed' 
                                        : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white hover:shadow-pink-500/25'
                                    }`}
                                >
                                    <Layers size={16} />
                                    <span>Generate Script (2 Steps)</span>
                                </button>
                                <button
                                    onClick={handleAiImport}
                                    disabled={!importText.trim()}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all ${
                                        !importText.trim() 
                                        ? 'bg-daw-800 text-daw-500 cursor-not-allowed' 
                                        : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white hover:shadow-purple-500/25'
                                    }`}
                                >
                                    <Sparkles size={16} />
                                    <span>Generate Script</span>
                                </button>
                            </>
                        ) : streamStatus === 'streaming' ? (
                            <div className="flex items-center gap-4 px-2">
                                <span className="text-xs font-mono text-daw-500">
                                    {generatedContent ? `${generatedContent.length} chars` : 'Thinking...'}
                                </span>
                                <div className="flex items-center gap-2 px-4 py-2 bg-daw-800/50 rounded-lg border border-daw-700/50 text-daw-300">
                                    <Loader2 size={16} className="animate-spin text-purple-400" />
                                    <span className="text-sm font-medium">Processing</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <button 
                                    onClick={resetImport}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-daw-400 hover:text-white hover:bg-daw-800 transition-colors"
                                >
                                    <RotateCcw size={14} />
                                    <span>Reset</span>
                                </button>
                                <button
                                    onClick={applyImport}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg hover:shadow-emerald-500/25 transition-all"
                                >
                                    <Check size={16} />
                                    <span>Import to Editor</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </StoryContext.Provider>
  );
};

export default App;