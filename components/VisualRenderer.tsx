import React, { useContext } from 'react';
import { ScriptNode, NodeType } from '../types';
import { parseDialogue } from '../utils/parser';
import { 
  Music, Volume2, Clock, Layers, List, Zap, 
  Phone, Radio, Activity, Sparkles, Ghost, Bot, Shell,
  WifiOff, Megaphone, Disc3, HardHat, BoxSelect, Maximize2, 
  Speaker, Cloud, Waves, Skull, Wind, Mountain, Crown, Mic,
  ArrowDown
} from 'lucide-react';

// --- Context ---
export const StoryContext = React.createContext<{
  characterColors: Record<string, string>;
}>({ characterColors: {} });

// --- Voice Effect Configuration ---
const getEffectConfig = (effectName: string) => {
    const e = effectName.toLowerCase().replace(/[<>]/g, '');
    
    // Communication / Tech
    if (e.includes('phone') || e.includes('call')) return { 
        icon: <Phone size={12} />, 
        style: 'font-mono text-emerald-300 bg-emerald-950/40 border-l-2 border-emerald-500/40 pl-3 pr-2 py-1 rounded-r-md' 
    };
    if (e.includes('radio') || e.includes('broadcast')) return { 
        icon: <Radio size={12} />, 
        style: 'font-mono text-amber-400 bg-amber-950/40 border-l-2 border-amber-500/40 pl-3 pr-2 py-1 rounded-r-md' 
    };
    if (e.includes('walkie')) return { 
        icon: <Radio size={12} />, 
        style: 'font-mono text-lime-400 bg-lime-950/40 border-l-2 border-lime-500/40 pl-3 pr-2 py-1 rounded-r-md uppercase tracking-tight' 
    };
    if (e.includes('bad_signal') || e.includes('signal')) return { 
        icon: <WifiOff size={12} />, 
        style: 'font-mono text-red-400 tracking-tighter blur-[0.5px] animate-pulse bg-red-950/10' 
    };
    if (e.includes('megaphone')) return { 
        icon: <Megaphone size={12} />, 
        style: 'uppercase font-bold tracking-widest text-yellow-400 bg-yellow-950/30 px-2 py-1' 
    };
    if (e.includes('gramophone')) return { 
        icon: <Disc3 size={12} />, 
        style: 'font-serif italic text-amber-200/70 tracking-widest bg-amber-900/10 px-2 py-1' 
    };
    if (e.includes('helmet')) return { 
        icon: <HardHat size={12} />, 
        style: 'text-slate-400 font-bold bg-slate-800/80 rounded px-2 py-0.5 border border-slate-600' 
    };

    // Environment
    if (e.includes('small_room')) return { 
        icon: <BoxSelect size={12} />, 
        style: 'text-sm tracking-tight bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700 inline-block shadow-inner' 
    };
    if (e.includes('large_hall')) return { 
        icon: <Maximize2 size={12} />, 
        style: 'tracking-[0.25em] text-slate-300 drop-shadow-md bg-gradient-to-r from-transparent via-slate-800/30 to-transparent' 
    };
    if (e.includes('stadium')) return { 
        icon: <Speaker size={12} />, 
        style: 'uppercase font-black text-blue-300 tracking-widest drop-shadow-lg' 
    };
    if (e.includes('dream')) return { 
        icon: <Cloud size={12} />, 
        style: 'italic text-fuchsia-300 blur-[0.3px] drop-shadow-[0_0_8px_rgba(232,121,249,0.4)]' 
    };
    if (e.includes('underwater')) return { 
        icon: <Waves size={12} />, 
        style: 'text-cyan-400 italic bg-cyan-950/30 px-2 rounded-full border border-cyan-800/30' 
    };

    // Character
    if (e.includes('robot') || e.includes('ai')) return { 
        icon: <Bot size={12} />, 
        style: 'font-mono text-cyan-300 tracking-widest uppercase bg-cyan-950/40 px-2 border-l border-cyan-500' 
    };
    if (e.includes('monster')) return { 
        icon: <Skull size={12} />, 
        style: 'font-black text-lg text-rose-700 tracking-tighter drop-shadow-sm bg-rose-950/20 px-1' 
    };
    if (e.includes('whisper')) return { 
        icon: <Wind size={12} />, 
        style: 'text-xs italic text-slate-400/80 tracking-wide font-light' 
    };
    if (e.includes('ghost') || e.includes('spirit')) return { 
        icon: <Ghost size={12} />, 
        style: 'text-slate-300 blur-[0.6px] opacity-70 tracking-wider' 
    };
    if (e.includes('giant') || e.includes('titan')) return { 
        icon: <Mountain size={12} />, 
        style: 'text-xl font-black uppercase text-stone-500 tracking-[0.15em] drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]' 
    };
    if (e.includes('fairy') || e.includes('tiny')) return { 
        icon: <Sparkles size={12} />, 
        style: 'text-xs font-bold text-pink-300 drop-shadow-[0_0_6px_rgba(244,114,182,0.8)]' 
    };
    if (e.includes('alien')) return { 
        icon: <Zap size={12} />, 
        style: 'font-mono text-lime-400 tracking-widest decoration-wavy underline decoration-lime-600/50' 
    };
    if (e.includes('ancient') || e.includes('god')) return { 
        icon: <Crown size={12} />, 
        style: 'font-serif text-amber-100 text-lg tracking-widest drop-shadow-[0_0_10px_rgba(251,191,36,0.5)] bg-gradient-to-r from-amber-900/0 via-amber-900/20 to-amber-900/0' 
    };

    return { icon: <Zap size={12} />, style: 'text-indigo-300' };
};

// --- Dialogue Node Component ---
const DialogueView = ({ content }: { content: string }) => {
  const { characterColors } = useContext(StoryContext);
  const { role, emotion, text, voiceEffects, isNarration } = parseDialogue(content);

  const getRoleColor = (r: string) => {
    if (characterColors[r]) return characterColors[r];
    return 'bg-slate-700 text-slate-200';
  };

  const roleColorClass = getRoleColor(role);

  const primaryEffect = voiceEffects && voiceEffects.length > 0 ? voiceEffects[0] : null;
  const effectConfig = primaryEffect ? getEffectConfig(primaryEffect) : { style: 'text-gray-200', icon: null };
  const textStyleClass = primaryEffect ? effectConfig.style : 'text-slate-200 text-base leading-snug';

  if (isNarration) {
    return (
      <div className="py-2.5 px-4 border-l-4 border-slate-500 bg-slate-800 rounded-r-lg my-1 shadow-sm hover:border-slate-400 transition-all">
        <div className="flex items-center mb-1 opacity-90">
             <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400 mr-2">Narration</span>
             {emotion && <span className="text-[10px] text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded border border-slate-600">({emotion})</span>}
        </div>
        <span className="text-slate-200 leading-relaxed font-sans text-base">{text}</span>
      </div>
    );
  }

  const nameTextColorClass = roleColorClass.replace('bg-', 'text-').replace('text-white', '');

  return (
    <div className="flex gap-3 py-2 px-3 bg-daw-800/80 backdrop-blur-sm rounded-lg border border-daw-700/50 my-1 shadow-sm hover:border-daw-600/80 transition-all group">
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${roleColorClass} shadow-md flex items-center justify-center text-xs font-bold border border-white/10 group-hover:scale-105 transition-transform`}>
        {role.substring(0, 1)}
      </div>
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Header: Role + Metadata */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`font-bold text-xs tracking-wide ${nameTextColorClass} brightness-125`}>
              {role}
          </span>
          
          {emotion && (
            <span className="text-[9px] font-medium bg-daw-900/50 text-daw-400 px-1.5 py-px rounded border border-daw-700/50">
              {emotion}
            </span>
          )}
          
          {voiceEffects && voiceEffects.length > 0 && (
             <div className="flex gap-1.5">
                 {voiceEffects.map((effect, idx) => {
                    const cfg = getEffectConfig(effect);
                    return (
                        <span key={idx} className="flex items-center gap-1 text-[8px] uppercase font-bold bg-indigo-500/10 text-indigo-400 px-1.5 py-px rounded border border-indigo-500/20" title={effect}>
                            {cfg.icon}
                            {effect.replace(/[<>_]/g, ' ')}
                        </span>
                    );
                 })}
             </div>
          )}
        </div>
        
        {/* Dialogue Text */}
        <div className="relative">
           {voiceEffects?.some(e => e.includes('bad_signal')) && (
               <span className="absolute inset-0 animate-pulse opacity-10 bg-red-500 blur-sm pointer-events-none select-none"></span>
           )}
           <p className={`${textStyleClass} text-sm transition-all duration-300`}>
             "{text}"
           </p>
        </div>
      </div>
    </div>
  );
};

// --- Sound Node Component (Compact) ---
const SoundView = ({ node }: { node: ScriptNode }) => {
  const { name, volume, loop } = node.attributes || { name: 'Unknown', description: '' };
  const isAtmosphere = volume === '0.2' || loop;

  return (
    <div className={`
      relative overflow-hidden rounded-md border px-2 py-1.5 my-1 flex items-center gap-2 transition-all select-none group
      ${isAtmosphere 
        ? 'bg-amber-950/30 border-amber-700/30 text-amber-100/90 hover:bg-amber-950/50' 
        : 'bg-emerald-950/30 border-emerald-700/30 text-emerald-100/90 hover:bg-emerald-950/50'}
    `}>
      <div className={`p-1 rounded-sm ${isAtmosphere ? 'text-amber-400' : 'text-emerald-400'}`}>
        {isAtmosphere ? <Music size={12} /> : <Volume2 size={12} />}
      </div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <span className="font-bold text-[10px] uppercase tracking-wide truncate leading-none" title={name}>
              {name}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
             {loop && <span className="text-[8px] bg-white/10 px-1 rounded text-current font-medium leading-none py-0.5">LOOP</span>}
             {volume && (
                <span className="text-[8px] opacity-60 font-mono leading-none">
                    {Math.round(parseFloat(volume) * 100)}%
                </span>
             )}
          </div>
      </div>
    </div>
  );
};

// --- Pause Node Component ---
const PauseView = ({ duration }: { duration?: number }) => (
  <div className="flex justify-center my-3 relative">
    <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-dashed border-daw-700/50"></div>
    </div>
    <div className="relative flex items-center gap-2 px-3 py-0.5 rounded-full bg-daw-900 border border-daw-700 text-[10px] text-daw-500 font-mono shadow-sm z-10">
      <Clock size={10} />
      <span className="tracking-widest">{duration}s PAUSE</span>
    </div>
  </div>
);

// --- Recursive Block Renderer ---
export const ScriptBlock: React.FC<{ node: ScriptNode; nested?: boolean }> = ({ node, nested = false }) => {
  if (node.type === NodeType.TEXT && node.content) {
    return <div id={node.id}><DialogueView content={node.content} /></div>;
  }

  if (node.type === NodeType.SOUND) {
    return <div id={node.id}><SoundView node={node} /></div>;
  }

  if (node.type === NodeType.PAUSE) {
    return <div id={node.id}><PauseView duration={node.duration} /></div>;
  }

  if (node.type === NodeType.PARALLEL) {
    const marginClass = nested ? "my-2" : "my-6";
    const paddingClass = nested ? "p-3" : "p-4";
    
    // Group adjacent SOUND nodes into a single column
    const children = node.children || [];
    const columns: Array<{ nodes: ScriptNode[], isSoundGroup: boolean }> = [];
    
    let currentSoundGroup: ScriptNode[] = [];
    
    children.forEach(child => {
        if (child.type === NodeType.SOUND) {
            currentSoundGroup.push(child);
        } else {
            if (currentSoundGroup.length > 0) {
                columns.push({ nodes: [...currentSoundGroup], isSoundGroup: true });
                currentSoundGroup = [];
            }
            columns.push({ nodes: [child], isSoundGroup: false });
        }
    });
    
    if (currentSoundGroup.length > 0) {
        columns.push({ nodes: [...currentSoundGroup], isSoundGroup: true });
    }
    
    return (
      <div id={node.id} className={`${marginClass} relative group`}>
         <div className="bg-fuchsia-900/10 border border-fuchsia-500/30 rounded-xl overflow-hidden shadow-sm hover:border-fuchsia-500/50 transition-colors">
             {/* Header */}
             <div className="bg-fuchsia-950/40 px-3 py-1.5 flex items-center justify-between border-b border-fuchsia-500/10">
                 <div className="flex items-center gap-2">
                    <Layers size={12} className="text-fuchsia-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">Parallel</span>
                 </div>
                 <span className="text-[9px] text-fuchsia-500/60 font-mono hidden sm:inline-block">SIMULTANEOUS</span>
             </div>
             
             {/* Content - Horizontal Layout */}
             <div className={`${paddingClass} flex flex-row gap-4 overflow-x-auto items-stretch pb-4`}>
                 {columns.map((col, i) => {
                     // Determine if the column should be compact.
                     // It is compact if it's a raw sound group OR if it's a sequence containing ONLY sounds/pauses.
                     const isSoundSequence = !col.isSoundGroup && 
                        col.nodes[0].type === NodeType.SEQUENTIAL && 
                        col.nodes[0].children?.every(c => c.type === NodeType.SOUND || c.type === NodeType.PAUSE);

                     const isCompact = col.isSoundGroup || isSoundSequence;

                     return (
                         <div 
                            key={i} 
                            className={`relative flex flex-col ${isCompact ? 'flex-none w-48' : 'flex-1 min-w-[320px]'}`}
                         >
                             {/* Divider line for items after first */}
                             {i > 0 && (
                                 <div className="absolute -left-2 top-0 bottom-0 w-px bg-fuchsia-500/10 border-l border-dashed border-fuchsia-500/20"></div>
                             )}
                             
                             {col.isSoundGroup ? (
                                 <div className="flex flex-col gap-2">
                                     {col.nodes.map(child => (
                                         <ScriptBlock key={child.id} node={child} nested={true} />
                                     ))}
                                 </div>
                             ) : (
                                 <ScriptBlock node={col.nodes[0]} nested={true} />
                             )}
                         </div>
                     );
                 })}
             </div>
         </div>
      </div>
    );
  }

  if (node.type === NodeType.SEQUENTIAL) {
    const isRoot = node.id === 'root';
    
    if (isRoot) {
        return (
            <div id={node.id} className="space-y-4">
                {node.children?.map((child) => (
                    <ScriptBlock key={child.id} node={child} />
                ))}
            </div>
        );
    }

    const marginClass = nested ? "my-1" : "my-4";
    const paddingClass = nested ? "p-2" : "p-3";

    return (
        <div id={node.id} className={`${marginClass} relative`}>
            <div className="bg-cyan-900/10 border border-cyan-500/30 rounded-xl overflow-hidden shadow-sm hover:border-cyan-500/50 transition-colors">
                    <div className="bg-cyan-950/40 px-3 py-1.5 flex items-center justify-between border-b border-cyan-500/10">
                    <div className="flex items-center gap-2">
                        <ArrowDown size={12} className="text-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Sequence</span>
                    </div>
                    <span className="text-[9px] text-cyan-500/60 font-mono hidden sm:inline-block">IN ORDER</span>
                </div>
                    <div className={`${paddingClass} flex flex-col gap-2 relative`}>
                    {node.children?.map((child, idx, arr) => (
                        <div key={child.id} className="relative pl-3">
                            {/* Connector Line */}
                            {idx !== arr.length - 1 && (
                                <div className="absolute left-[4px] top-3 bottom-[-8px] w-px bg-cyan-500/20"></div>
                            )}
                            {/* Dot */}
                            <div className="absolute left-[2px] top-3 w-[5px] h-[5px] rounded-full bg-cyan-500/40"></div>
                            
                            <ScriptBlock node={child} nested={true} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  }

  return null;
};