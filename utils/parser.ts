import { NodeType, ScriptNode, SoundAttributes, DialogueLine, ParsedStory, CharacterProfile } from '../types';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

const getLineNumber = (fullText: string, index: number) => {
    return (fullText.substring(0, index).match(/\n/g) || []).length + 1;
};

export const parseStory = (fullText: string): ParsedStory => {
  const titleMatch = fullText.match(/STORY_TITLE:\s*([\s\S]*?)(?=FINAL_TEXT:)/);
  const textMatch = fullText.match(/FINAL_TEXT:\s*([\s\S]*?)(?=CHARACTER_GUIDE:|$)/);
  const guideMatch = fullText.match(/CHARACTER_GUIDE:\s*([\s\S]*?)(?=BACKGROUND_MUSIC:|$)/);
  const musicMatch = fullText.match(/BACKGROUND_MUSIC:\s*([\s\S]*?)$/);

  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Story';
  const rawScript = textMatch ? textMatch[1].trim() : '';
  const characterGuide = guideMatch ? guideMatch[1].trim() : '';
  const backgroundMusic = musicMatch ? musicMatch[1].trim() : '';

  // Calculate line numbers
  const titleLine = titleMatch ? getLineNumber(fullText, titleMatch.index!) : 0;
  // script start line is handled below
  const guideLine = guideMatch ? getLineNumber(fullText, guideMatch.index!) : undefined;
  const musicLine = musicMatch ? getLineNumber(fullText, musicMatch.index!) : undefined;

  // Calculate the starting line number for the script section
  const scriptStartIndex = textMatch ? textMatch.index! + textMatch[0].indexOf(rawScript) : 0;
  const startLine = getLineNumber(fullText, scriptStartIndex);

  const scriptNodes = parseScriptContent(rawScript, startLine);
  const characters = parseCharacterProfiles(characterGuide);

  return {
    title,
    scriptNodes,
    characterGuide,
    characters,
    backgroundMusic,
    titleLine,
    guideLine,
    musicLine
  };
};

const parseCharacterProfiles = (guideText: string): CharacterProfile[] => {
  if (!guideText) return [];

  const profiles: CharacterProfile[] = [];
  const lines = guideText.split('\n');
  
  let currentName = '';
  let currentBuffer: string[] = [];
  
  // Basic heuristic: A line ending in ':' that is not a known attribute key is a Name.
  const attributeKeys = ['性别', 'gender', '年龄', 'age', '个性', 'personality', '声音推荐', 'voice', 'sound', 'role', 'desc'];

  const finalizeProfile = () => {
    if (currentName) {
      // Parse buffer for attributes
      const raw = currentBuffer.join('\n');
      const genderMatch = raw.match(/(?:性别|Gender):\s*(.*)/i);
      const ageMatch = raw.match(/(?:年龄|Age):\s*(.*)/i);
      const personalityMatch = raw.match(/(?:个性|Personality):\s*(.*)/i);
      const voiceMatch = raw.match(/(?:声音推荐|Voice|Sound):\s*(.*)/i);

      profiles.push({
        name: currentName,
        gender: genderMatch ? genderMatch[1].trim() : undefined,
        age: ageMatch ? ageMatch[1].trim() : undefined,
        personality: personalityMatch ? personalityMatch[1].trim() : undefined,
        voice: voiceMatch ? voiceMatch[1].trim() : undefined,
        rawProfile: raw
      });
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.endsWith(':')) {
       const key = trimmed.slice(0, -1).trim();
       // Check if this is an attribute key or a name
       const isAttribute = attributeKeys.some(k => key.toLowerCase().includes(k.toLowerCase()));
       
       if (!isAttribute) {
         // It's a new character
         finalizeProfile();
         currentName = key;
         currentBuffer = [];
         return;
       }
    }
    currentBuffer.push(trimmed);
  });
  
  finalizeProfile(); // Finalize last one
  return profiles;
};

// Recursive parser for the XML-like structure mixed with text lines
const parseScriptContent = (text: string, startLine: number = 1): ScriptNode[] => {
  return reparseRobust(text, startLine);
};

const reparseRobust = (text: string, initialLine: number): ScriptNode[] => {
    const rootChildren: ScriptNode[] = [];
    const stack: ScriptNode[] = [{ type: NodeType.SEQUENTIAL, children: rootChildren, id: 'root', lineNumber: initialLine }];
    
    let i = 0;
    let currentLine = initialLine;
    let lastProcessedIndex = 0;

    const advanceLineCount = (endIndex: number) => {
        if (endIndex <= lastProcessedIndex) return;
        const chunk = text.substring(lastProcessedIndex, endIndex);
        const newLines = (chunk.match(/\n/g) || []).length;
        currentLine += newLines;
        lastProcessedIndex = endIndex;
    };

    while (i < text.length) {
        const nextTagStart = text.indexOf('<', i);
        
        if (nextTagStart === -1) {
            // No more tags, process remaining text
            const remaining = text.substring(lastProcessedIndex);
            if (remaining) {
                addTextNodes(remaining, stack[stack.length - 1], currentLine);
            }
            break;
        }

        const nextTagEnd = text.indexOf('>', nextTagStart);
        if (nextTagEnd === -1) {
           // Malformed tag, treat as text
           const remaining = text.substring(lastProcessedIndex);
           addTextNodes(remaining, stack[stack.length - 1], currentLine);
           break;
        }
        
        const tagContent = text.substring(nextTagStart + 1, nextTagEnd).trim();
        const tagLower = tagContent.toLowerCase();
        
        // Identify if this is a structural tag we need to handle specially
        const isStructural = 
             tagLower.startsWith('parallel') || 
             tagLower.startsWith('/parallel') ||
             tagLower.startsWith('sequential') ||
             tagLower.startsWith('/sequential') ||
             tagLower.startsWith('sound') ||
             tagLower.startsWith('/sound') ||
             tagLower.startsWith('#');

        if (!isStructural) {
            // Not a structural tag (e.g. <phone_call>), treat it as part of the text.
            // Just skip the '<' and continue searching for next tag.
            // We do NOT update lastProcessedIndex, so this tag remains part of the accumulated text.
            i = nextTagStart + 1;
            continue;
        }

        // It IS a structural tag. 
        // 1. Flush any accumulated text before this tag.
        const contentBefore = text.substring(lastProcessedIndex, nextTagStart);
        if (contentBefore) {
            addTextNodes(contentBefore, stack[stack.length - 1], currentLine);
        }
        
        // Update line counter to the start of this tag
        advanceLineCount(nextTagStart);

        // 2. Process the structural tag
        if (tagLower.startsWith('/')) {
            // Closing tag
            if (stack.length > 1) {
                // Check if it matches the top (simple check, or just pop)
                stack.pop();
            }
            i = nextTagEnd + 1;
            advanceLineCount(nextTagEnd + 1);
        } 
        else if (tagLower.startsWith('#')) {
            const duration = parseFloat(tagContent.replace(/#/g, ''));
            const currentNode = stack[stack.length - 1];
            if (currentNode.children) {
                currentNode.children.push({ type: NodeType.PAUSE, duration, id: generateId(), lineNumber: currentLine });
            }
            i = nextTagEnd + 1;
            advanceLineCount(nextTagEnd + 1);
        }
        else if (tagLower.startsWith('sound')) {
            const nameMatch = tagContent.match(/name="([^"]*)"/i);
            const volMatch = tagContent.match(/volume="([^"]*)"/i);
            const loopMatch = tagLower.includes('loop');
            
            let description = '';
            let newIndex = nextTagEnd + 1;
            
            // Look for closing sound tag to capture description
            const soundEndTag = text.indexOf('</sound>', nextTagEnd);
            if (soundEndTag !== -1) {
                description = text.substring(nextTagEnd + 1, soundEndTag).trim();
                newIndex = soundEndTag + 8; // length of </sound>
            }
            
            const currentNode = stack[stack.length - 1];
            if (currentNode.children) {
                currentNode.children.push({
                    type: NodeType.SOUND,
                    attributes: {
                        name: nameMatch ? nameMatch[1] : 'SFX',
                        description,
                        volume: volMatch ? volMatch[1] : undefined,
                        loop: loopMatch
                    },
                    id: generateId(),
                    lineNumber: currentLine
                });
            }
            i = newIndex;
            advanceLineCount(newIndex);
        }
        else if (tagLower.startsWith('parallel') || tagLower.startsWith('sequential')) {
            const type = tagLower.startsWith('parallel') ? NodeType.PARALLEL : NodeType.SEQUENTIAL;
            const newNode: ScriptNode = { type, children: [], id: generateId(), lineNumber: currentLine };
            const currentNode = stack[stack.length - 1];
            if (currentNode.children) {
                currentNode.children.push(newNode);
            }
            stack.push(newNode);
            i = nextTagEnd + 1;
            advanceLineCount(nextTagEnd + 1);
        }
    }
    
    return rootChildren;
};

const addTextNodes = (content: string, parent: ScriptNode, startLine: number) => {
    if (!parent.children) return;
    
    const lines = content.split('\n');
    
    for (let k = 0; k < lines.length; k++) {
        const line = lines[k];
        if (line.trim().length > 0) { 
            parent.children.push({
                type: NodeType.TEXT,
                content: line,
                id: generateId(),
                lineNumber: startLine + k 
            });
        }
    }
};

export const parseDialogue = (line: string): DialogueLine => {
  const cleanLine = line.trim();
  const match = cleanLine.match(/^([^:(]+)(?:\(([^)]+)\))?:\s*(.*)/s); 
  
  if (!match) {
    if (cleanLine.toLowerCase().startsWith('narration')) {
       return { role: 'Narration', text: cleanLine.replace(/^Narration\s*:?/, '').trim(), isNarration: true };
    }
    return { role: '', text: cleanLine, isNarration: true };
  }

  const role = match[1].trim();
  const emotion = match[2] ? match[2].trim() : undefined;
  let textContent = match[3].trim();
  
  const isNarration = role.toLowerCase() === 'narration';
  const voiceEffects: string[] = [];
  
  const effectRegex = /<([^>]+)>/g;
  let effectMatch;
  while ((effectMatch = effectRegex.exec(textContent)) !== null) {
      voiceEffects.push(effectMatch[1]);
  }
  
  const displayText = textContent.replace(effectRegex, '').trim(); 
  const finalText = displayText.replace(/^"|"$/g, '');

  return {
    role,
    emotion,
    text: finalText,
    voiceEffects,
    isNarration
  };
};