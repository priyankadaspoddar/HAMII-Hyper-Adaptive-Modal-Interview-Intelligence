/**
 * Resume Parser - Efficient PDF/DOCX text extraction
 * Uses pdfjs-dist for PDF parsing with optimized performance
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ParsedResume {
  text: string;
  pageCount: number;
  metadata?: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
  sections?: {
    contact?: string;
    education?: string;
    experience?: string;
    skills?: string;
    projects?: string;
  };
}

export interface ParseResult {
  success: boolean;
  data?: ParsedResume;
  error?: string;
}

/**
 * Extract text from PDF using pdfjs-dist
 * Optimized for resume parsing with section detection
 */
export async function parsePDF(file: File): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const pageCount = pdf.numPages;
    let fullText = '';
    const textByPage: string[] = [];

    // Extract text from all pages in parallel for efficiency
    const pagePromises = [];
    for (let i = 1; i <= pageCount; i++) {
      pagePromises.push(extractPageText(pdf, i));
    }
    
    const pageTexts = await Promise.all(pagePromises);
    pageTexts.forEach((text, index) => {
      textByPage.push(text);
      fullText += text + '\n\n';
    });

    // Extract metadata
    const metadata = await pdf.getMetadata().catch(() => null);
    const info = metadata?.info as Record<string, any> | undefined;

    // Clean and normalize the text
    const cleanedText = cleanResumeText(fullText);

    // Detect sections
    const sections = detectSections(cleanedText);

    return {
      success: true,
      data: {
        text: cleanedText,
        pageCount,
        metadata: {
          title: info?.Title,
          author: info?.Author,
          creationDate: info?.CreationDate,
        },
        sections,
      },
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
    };
  }
}

/**
 * Extract text from a single PDF page
 */
async function extractPageText(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  
  // Build text with proper spacing
  let lastY = -1;
  let text = '';
  
  for (const item of textContent.items) {
    if ('str' in item) {
      const textItem = item as { str: string; transform: number[] };
      const transform = textItem.transform;
      const y = transform[5];
      
      // Add newline if Y position changes significantly (new line)
      if (lastY !== -1 && Math.abs(lastY - y) > 5) {
        text += '\n';
      } else if (text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
        // Add space between items on the same line
        text += ' ';
      }
      
      text += textItem.str;
      lastY = y;
    }
  }
  
  return text;
}

/**
 * Parse plain text files
 */
export async function parseTextFile(file: File): Promise<ParseResult> {
  try {
    const text = await file.text();
    const cleanedText = cleanResumeText(text);
    const sections = detectSections(cleanedText);
    
    return {
      success: true,
      data: {
        text: cleanedText,
        pageCount: 1,
        sections,
      },
    };
  } catch (error) {
    console.error('Text file parsing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse text file',
    };
  }
}

/**
 * Parse DOCX files (basic extraction)
 * For complex DOCX files, consider using mammoth.js
 */
export async function parseDocx(file: File): Promise<ParseResult> {
  try {
    // DOCX is a ZIP file containing XML
    const arrayBuffer = await file.arrayBuffer();
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Get the main document content
    const docXml = await zip.file('word/document.xml')?.async('text');
    
    if (!docXml) {
      return {
        success: false,
        error: 'Could not find document content in DOCX file',
      };
    }
    
    // Extract text from XML (basic extraction)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'text/xml');
    
    // Get all text nodes
    const textNodes = xmlDoc.getElementsByTagName('w:t');
    let text = '';
    let lastParagraph = '';
    
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const parentParagraph = node.closest('w:p');
      const paragraphId = parentParagraph?.getAttribute('w14:paraId') || i.toString();
      
      if (paragraphId !== lastParagraph && text.length > 0) {
        text += '\n';
      }
      
      text += node.textContent || '';
      lastParagraph = paragraphId;
    }
    
    const cleanedText = cleanResumeText(text);
    const sections = detectSections(cleanedText);
    
    return {
      success: true,
      data: {
        text: cleanedText,
        pageCount: 1,
        sections,
      },
    };
  } catch (error) {
    console.error('DOCX parsing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse DOCX file',
    };
  }
}

/**
 * Universal resume parser - detects file type and parses accordingly
 */
export async function parseResume(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;
  
  // PDF files
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return parsePDF(file);
  }
  
  // DOCX files
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    return parseDocx(file);
  }
  
  // DOC files (legacy Word format - limited support)
  if (mimeType === 'application/msword' || fileName.endsWith('.doc')) {
    return {
      success: false,
      error: 'Legacy .doc format is not supported. Please convert to .docx or .pdf',
    };
  }
  
  // Text files (default)
  return parseTextFile(file);
}

/**
 * Clean and normalize resume text
 */
function cleanResumeText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive whitespace but preserve paragraph breaks
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace from lines
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Remove empty lines at start/end
    .trim();
}

/**
 * Detect common resume sections
 */
function detectSections(text: string): ParsedResume['sections'] {
  const sections: ParsedResume['sections'] = {};
  const lines = text.split('\n');
  
  // Common section headers (case-insensitive)
  const sectionPatterns = {
    contact: /^(contact|personal\s*info|address|email|phone)/i,
    education: /^(education|academic|qualification|degree)/i,
    experience: /^(experience|work\s*history|employment|professional\s*experience|work\s*experience)/i,
    skills: /^(skills|technical\s*skills|competencies|expertise|technologies)/i,
    projects: /^(projects|personal\s*projects|portfolio|key\s*projects)/i,
  };
  
  let currentSection: keyof typeof sectionPatterns | null = null;
  let sectionContent: string[] = [];
  
  for (const line of lines) {
    // Check if line is a section header
    let foundSection: keyof typeof sectionPatterns | null = null;
    
    for (const [section, pattern] of Object.entries(sectionPatterns)) {
      if (pattern.test(line)) {
        foundSection = section as keyof typeof sectionPatterns;
        break;
      }
    }
    
    if (foundSection) {
      // Save previous section
      if (currentSection && sectionContent.length > 0) {
        sections[currentSection] = sectionContent.join('\n').trim();
      }
      
      currentSection = foundSection;
      sectionContent = [line];
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection && sectionContent.length > 0) {
    sections[currentSection] = sectionContent.join('\n').trim();
  }
  
  return Object.keys(sections).length > 0 ? sections : undefined;
}

/**
 * Validate parsed resume has sufficient content
 */
export function validateResumeContent(result: ParseResult): {
  isValid: boolean;
  message: string;
} {
  if (!result.success || !result.data) {
    return {
      isValid: false,
      message: result.error || 'Failed to parse resume',
    };
  }
  
  const { text } = result.data;
  
  if (text.length < 100) {
    return {
      isValid: false,
      message: 'Resume appears to be too short. Please upload a complete resume.',
    };
  }
  
  if (text.length < 300) {
    return {
      isValid: true,
      message: 'Resume parsed but appears brief. Some questions may be generic.',
    };
  }
  
  return {
    isValid: true,
    message: 'Resume parsed successfully',
  };
}
