export enum NodeType {
  TEXT = 'TEXT',
  PARALLEL = 'PARALLEL',
  SEQUENTIAL = 'SEQUENTIAL',
  SOUND = 'SOUND',
  PAUSE = 'PAUSE'
}

export interface SoundAttributes {
  name: string;
  description: string;
  volume?: string;
  loop?: boolean;
}

export interface ScriptNode {
  type: NodeType;
  content?: string; // For TEXT lines
  children?: ScriptNode[]; // For PARALLEL/SEQUENTIAL
  attributes?: SoundAttributes; // For SOUND
  duration?: number; // For PAUSE
  id: string;
  lineNumber?: number; // Line number in the source text
}

export interface CharacterProfile {
  name: string;
  gender?: string;
  age?: string;
  personality?: string;
  voice?: string;
  rawProfile: string; // The full text block for this character
}

export interface ParsedStory {
  title: string;
  scriptNodes: ScriptNode[];
  characterGuide: string;
  characters: CharacterProfile[];
  backgroundMusic: string;
  titleLine?: number;
  guideLine?: number;
  musicLine?: number;
}

export interface DialogueLine {
  role: string;
  emotion?: string;
  text: string;
  voiceEffects?: string[];
  isNarration: boolean;
}