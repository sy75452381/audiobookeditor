
import { NodeType } from '../types';

interface BlockNode {
  type: 'root' | 'parallel' | 'sequential';
  children: (BlockNode | string)[];
  parent?: BlockNode;
}

export const StoryRepairUtils = {
  repairStoryText: (text: string): string => {
    // We only want to process the actual script part to avoid messing up headers
    // However, for simplicity and robustness given the prompt, we will process the whole text
    // but ensure we don't break the key headers like STORY_TITLE etc.
    // The repair logic is mostly tag-specific, so it shouldn't affect plain metadata lines.

    let processing = text;
    processing = StoryRepairUtils.fixMisspelledTags(processing);
    processing = StoryRepairUtils.fixEmbeddedTags(processing);
    processing = StoryRepairUtils.fixUnclosedTags(processing);
    
    // Parse into a tree structure to perform logical block repairs
    const root = StoryRepairUtils.parseToTree(processing);
    
    // Step 4 & 5: Repair Blocks (Recursive)
    StoryRepairUtils.recursiveRepair(root);
    
    // Serialize back to text
    processing = StoryRepairUtils.treeToString(root);
    
    processing = StoryRepairUtils.cleanDoubleSequentialTags(processing);
    processing = StoryRepairUtils.autoFormatIndentation(processing);
    
    return processing.trim();
  },

  // Step 1: Fix Misspelled Tags
  fixMisspelledTags: (text: string): string => {
    return text
      .replace(/<parallell>/gi, '<parallel>')
      .replace(/<paralel>/gi, '<parallel>')
      .replace(/<\/parallell>/gi, '</parallel>')
      .replace(/<\/paralel>/gi, '</parallel>')
      .replace(/<sequencial>/gi, '<sequential>')
      .replace(/<sequental>/gi, '<sequential>')
      .replace(/<\/sequencial>/gi, '</sequential>')
      .replace(/<\/sequental>/gi, '</sequential>')
      .replace(/<simultaneous>/gi, '<parallel>') // Common alias
      .replace(/<\/simultaneous>/gi, '</parallel>');
  },

  // Step 2: Fix Embedded Tags
  fixEmbeddedTags: (text: string): string => {
    const lines = text.split('\n');
    const processedLines: string[] = [];

    for (let line of lines) {
        if (!line.trim()) {
            processedLines.push(line);
            continue;
        }

        // 1. Handle Block Tags (parallel/sequential) embedded in text
        // e.g. "Narration: Start <parallel>" -> "Narration: Start", "<parallel>"
        // using a simple replace to add newlines before opening tags if they are not at start
        let tempLine = line.replace(/(?<!^)(\s*)(<(?:parallel|sequential)[^>]*>)/gi, '\n$2');
        // And after closing tags if not at end
        tempLine = tempLine.replace(/(<\/(?:parallel|sequential)>)(\s*)(?!$)/gi, '$1\n');

        const subLines = tempLine.split('\n');
        
        for (let sub of subLines) {
            // 2. Handle Sound Tags embedded in text
            // We want to extract them out. 
            // Regex to find sound tags: <sound ...>...</sound> or self closing <sound ... /> or <#...#>
            // Note: Parser supports <#...#> as pauses. We treat them as sounds here.
            
            const soundRegex = /(<sound[^>]*>.*?<\/sound>|<sound[^>]*\/>|<#[^#]+#>|<pause[^>]*\/>)/gi;
            const matches = [...sub.matchAll(soundRegex)];
            
            if (matches.length > 0) {
                // Remove tags from text
                let cleanText = sub.replace(soundRegex, '').replace(/\s+/g, ' ').trim();
                
                // If there was text, add it
                if (cleanText) {
                    processedLines.push(cleanText);
                }
                
                // Add extracted tags
                for (const match of matches) {
                    processedLines.push(match[0]);
                }
            } else {
                processedLines.push(sub);
            }
        }
    }
    return processedLines.join('\n');
  },

  // Step 3: Fix Unclosed Tags
  fixUnclosedTags: (text: string): string => {
    const lines = text.split('\n');
    let balance = 0;
    const stack: string[] = []; // 'parallel' or 'sequential'

    for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.startsWith('<parallel')) stack.push('parallel');
        if (trimmed.startsWith('<sequential')) stack.push('sequential');
        
        if (trimmed.startsWith('</parallel')) {
            if (stack[stack.length - 1] === 'parallel') stack.pop();
        }
        if (trimmed.startsWith('</sequential')) {
            if (stack[stack.length - 1] === 'sequential') stack.pop();
        }
    }

    let result = text;
    while (stack.length > 0) {
        const tag = stack.pop();
        result += `\n</${tag}>`;
    }
    return result;
  },

  // Parsing for Step 4 & 5
  parseToTree: (text: string): BlockNode => {
    const root: BlockNode = { type: 'root', children: [] };
    let current: BlockNode = root;
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.match(/^<parallel[^>]*>/i)) {
            const node: BlockNode = { type: 'parallel', children: [], parent: current };
            current.children.push(node);
            current = node;
        } else if (trimmed.match(/^<\/parallel>/i)) {
            if (current.parent) current = current.parent;
        } else if (trimmed.match(/^<sequential[^>]*>/i)) {
            const node: BlockNode = { type: 'sequential', children: [], parent: current };
            current.children.push(node);
            current = node;
        } else if (trimmed.match(/^<\/sequential>/i)) {
            if (current.parent) current = current.parent;
        } else {
            // It's a string line (Dialogue, Narration, or Sound tag)
            current.children.push(trimmed);
        }
    }
    return root;
  },

  treeToString: (node: BlockNode, level: number = 0): string => {
      if (typeof node === 'string') {
          return node;
      }
      
      let result = '';
      const indent = ''; // We will rely on autoFormatIndentation step for spaces
      
      if (node.type !== 'root') {
          result += `<${node.type}>\n`;
      }
      
      for (const child of node.children) {
          if (typeof child === 'string') {
              result += child + '\n';
          } else {
              result += StoryRepairUtils.treeToString(child, level + 1);
          }
      }
      
      if (node.type !== 'root') {
          result += `</${node.type}>\n`;
      }
      
      return result;
  },

  isSoundLine: (line: string): boolean => {
      const l = line.trim();
      return l.startsWith('<sound') || l.startsWith('<#') || l.startsWith('<pause');
  },

  isPauseLine: (line: string): boolean => {
      const l = line.trim();
      return l.startsWith('<#') || l.startsWith('<pause');
  },

  isSoundEffectLine: (line: string): boolean => {
      const l = line.trim();
      return l.startsWith('<sound');
  },

  isSpeechLine: (line: string): boolean => {
      const l = line.trim();
      // Heuristic for speech: Not a sound, not a tag, usually has "Name:" or "Narration:"
      if (StoryRepairUtils.isSoundLine(l)) return false;
      if (l.startsWith('<') && !l.startsWith('<#')) return false; // Other tags
      return true;
  },

  // Check if a node is purely sound effects (sound strings or blocks containing only sounds, NO PAUSES)
  isPureSoundEffectNode: (node: BlockNode | string): boolean => {
      if (typeof node === 'string') {
          return StoryRepairUtils.isSoundEffectLine(node);
      }
      // It's a block
      if (node.children.length === 0) return false; 
      return node.children.every(child => StoryRepairUtils.isPureSoundEffectNode(child));
  },

  // Step 4 & 5 Logic
  recursiveRepair: (node: BlockNode) => {
      // First recurse down
      for (const child of node.children) {
          if (typeof child !== 'string') {
              StoryRepairUtils.recursiveRepair(child);
          }
      }

      // Now apply transformation to current node
      if (node.type === 'parallel') {
          StoryRepairUtils.repairParallelContent(node);
      } else if (node.type === 'sequential') {
          StoryRepairUtils.repairSequentialContent(node);
      }
  },

  // Rule: In <parallel>, consecutive speech lines should be wrapped in <sequential>
  // Exception: Different speakers with no narration should not be wrapped (simultaneous speech)
  repairParallelContent: (node: BlockNode) => {
      const newChildren: (BlockNode | string)[] = [];
      let speechBuffer: string[] = [];

      const flushBuffer = () => {
          if (speechBuffer.length > 0) {
             if (speechBuffer.length === 1) {
                 // Optimization: Don't wrap single speech lines in sequential inside parallel
                 newChildren.push(speechBuffer[0]);
             } else {
                 // Multiple speech lines check
                 const roles = speechBuffer.map(line => {
                     // Extract role: "Role(attr):" or "Role:"
                     const match = line.match(/^([^:(]+)/);
                     return match ? match[1].trim().toLowerCase() : 'unknown';
                 });

                 const hasNarration = roles.some(r => r === 'narration');
                 const uniqueRoles = new Set(roles);
                 // If there's only 1 unique role, it is the same speaker.
                 const isSameSpeaker = uniqueRoles.size === 1;

                 // Logic:
                 // 1. If Has Narration -> Always wrap in sequential (Narration + Dialogue or Narration + Narration are usually sequential)
                 // 2. If Same Speaker -> Always wrap in sequential (One person speaking multiple lines)
                 // 3. If Different Speakers AND No Narration -> Keep as Parallel siblings (Simultaneous speech)

                 if (!hasNarration && !isSameSpeaker) {
                     // Simultaneous case
                     newChildren.push(...speechBuffer);
                 } else {
                     // Sequential case
                     const seqNode: BlockNode = { type: 'sequential', children: [...speechBuffer], parent: node };
                     newChildren.push(seqNode);
                 }
             }
             speechBuffer = [];
          }
      };

      for (const child of node.children) {
          if (typeof child === 'string') {
              if (StoryRepairUtils.isSpeechLine(child)) {
                  speechBuffer.push(child);
              } else {
                  // It's a sound or comment
                  flushBuffer();
                  newChildren.push(child);
              }
          } else {
              // It's a block
              flushBuffer();
              newChildren.push(child);
          }
      }
      flushBuffer();
      node.children = newChildren;
  },

  // Rule: In <sequential>, sounds following speech should be grouped with that speech in <parallel>
  // CRITICAL: Do NOT wrap pauses (<#...#>) into the parallel block.
  repairSequentialContent: (node: BlockNode) => {
      const newChildren: (BlockNode | string)[] = [];
      
      for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          
          if (typeof child === 'string' && StoryRepairUtils.isSpeechLine(child)) {
              // Look ahead for sounds OR blocks containing only sounds (EXCLUDING PAUSES)
              const soundBuffer: (BlockNode | string)[] = [];
              let j = i + 1;
              while (j < node.children.length) {
                  const next = node.children[j];
                  if (StoryRepairUtils.isPureSoundEffectNode(next)) {
                      soundBuffer.push(next);
                      j++;
                  } else {
                      break;
                  }
              }
              
              if (soundBuffer.length > 0) {
                  // Found sounds (or sound blocks) associated with this speech
                  // Wrap in parallel
                  const parNode: BlockNode = { 
                      type: 'parallel', 
                      children: [child, ...soundBuffer], 
                      parent: node 
                  };
                  newChildren.push(parNode);
                  // Advance main loop
                  i = j - 1; 
              } else {
                  newChildren.push(child);
              }
          } else {
              newChildren.push(child);
          }
      }
      node.children = newChildren;
  },

  // Step 6: Clean Double Sequential Tags
  cleanDoubleSequentialTags: (text: string): string => {
      let res = text;
      // Remove empty sequentials/parallels first
      res = res.replace(/<(parallel|sequential)>\s*<\/\1>/gi, '');
      
      // Let's try to parse and clean the tree instead. It's safer.
      const root = StoryRepairUtils.parseToTree(res);
      StoryRepairUtils.recursiveClean(root);
      return StoryRepairUtils.treeToString(root).trim();
  },

  recursiveClean: (node: BlockNode) => {
      // Optimize children first
      node.children.forEach(c => {
          if (typeof c !== 'string') StoryRepairUtils.recursiveClean(c);
      });

      // Flatten double sequential: Sequential > Sequential (only child? or even multiple?)
      if (node.type === 'sequential' && node.children.length === 1) {
          const child = node.children[0];
          if (typeof child !== 'string' && child.type === 'sequential') {
              // Merge
              node.children = child.children;
              // Update parents
              node.children.forEach(c => {
                  if (typeof c !== 'string') c.parent = node;
              });
          }
      }
      
      // Also flatten Parallel > Parallel? (Not in spec, but good practice)
      if (node.type === 'parallel' && node.children.length === 1) {
          const child = node.children[0];
          if (typeof child !== 'string' && child.type === 'parallel') {
             node.children = child.children;
             node.children.forEach(c => { if (typeof c !== 'string') c.parent = node; });
          }
      }
  },

  // Step 7: Auto-Format Indentation
  autoFormatIndentation: (text: string): string => {
      const lines = text.split('\n');
      const formatted: string[] = [];
      let indent = 0;
      
      for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          
          // Decrease indent for closing tags
          if (line.match(/^<\/(parallel|sequential)>/i)) {
              indent = Math.max(0, indent - 1);
          }
          
          // Reset indent for Metadata headers
          if (line.match(/^(STORY_TITLE|FINAL_TEXT|CHARACTER_GUIDE|BACKGROUND_MUSIC|ENHANCED_TEXT):/)) {
              indent = 0;
          }
          
          formatted.push('    '.repeat(indent) + line);
          
          // Increase indent for opening tags
          if (line.match(/^<(parallel|sequential)[^>]*>/i) && !line.match(/\/>$/)) {
              indent++;
          }
      }
      
      return formatted.join('\n');
  }
};
