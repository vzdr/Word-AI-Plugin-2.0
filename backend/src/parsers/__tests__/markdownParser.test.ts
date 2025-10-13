/**
 * Tests for Markdown Parser
 */

import { MarkdownParser } from '../markdownParser';
import { FileType, ParserOptions } from '../../types/parser';
import { ValidationError } from '../../types/errors';

describe('MarkdownParser', () => {
  let parser: MarkdownParser;

  beforeEach(() => {
    parser = new MarkdownParser();
  });

  describe('initialization', () => {
    test('should support MD file type', () => {
      expect(parser.supports(FileType.MD)).toBe(true);
    });

    test('should not support other file types', () => {
      expect(parser.supports(FileType.PDF)).toBe(false);
      expect(parser.supports(FileType.DOCX)).toBe(false);
      expect(parser.supports(FileType.TXT)).toBe(false);
      expect(parser.supports(FileType.CSV)).toBe(false);
    });
  });

  describe('parse', () => {
    test('should parse simple markdown', async () => {
      const content = '# Hello World\n\nThis is a test.';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('# Hello World');
      expect(result.text).toContain('This is a test');
      expect(result.metadata.fileName).toBe('test.md');
      expect(result.metadata.fileType).toBe(FileType.MD);
    });

    test('should extract title from H1 heading', async () => {
      const content = '# Main Title\n\nContent here.';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.title).toBe('Main Title');
      expect(result.metadata.custom?.title).toBe('Main Title');
    });

    test('should extract markdown structure', async () => {
      const content = `# Title
## Subtitle
- Item 1
- Item 2

[Link](http://example.com)
![Image](image.png)

\`\`\`javascript
console.log('code');
\`\`\`
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.custom?.structure).toBeDefined();
      expect(result.metadata.custom?.structure.headings.length).toBeGreaterThan(
        0
      );
      expect(result.metadata.custom?.structure.links.length).toBeGreaterThan(0);
      expect(result.metadata.custom?.structure.images.length).toBeGreaterThan(
        0
      );
      expect(
        result.metadata.custom?.structure.codeBlocks.length
      ).toBeGreaterThan(0);
      expect(result.metadata.custom?.structure.lists.length).toBeGreaterThan(0);
    });

    test('should count markdown elements', async () => {
      const content = `# H1
## H2
### H3

- List item 1
- List item 2

[Link](url)

![Image](img.png)

\`\`\`js
code
\`\`\`
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.custom?.headingCount).toBe(3);
      expect(result.metadata.custom?.linkCount).toBe(1);
      expect(result.metadata.custom?.imageCount).toBe(1);
      expect(result.metadata.custom?.codeBlockCount).toBe(1);
      expect(result.metadata.custom?.listCount).toBeGreaterThan(0);
    });

    test('should preserve formatting when option is enabled', async () => {
      const content = '# Title\n\n\nMultiple\n\n\nNewlines';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        preserveFormatting: true,
      });

      // Should preserve multiple newlines
      expect(result.text).toContain('\n\n\n');
    });

    test('should clean formatting when option is disabled', async () => {
      const content = '# Title\n\n\n\n\nToo many newlines';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        preserveFormatting: false,
      });

      // Should reduce excessive newlines
      expect(result.text).not.toMatch(/\n{3,}/);
    });

    test('should extract headings with levels', async () => {
      const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      const headings = result.metadata.custom?.structure.headings;
      expect(headings).toHaveLength(6);
      expect(headings[0].level).toBe(1);
      expect(headings[0].text).toBe('H1');
      expect(headings[5].level).toBe(6);
      expect(headings[5].text).toBe('H6');
    });

    test('should extract links with text and URLs', async () => {
      const content = `[Google](https://google.com)
[GitHub](https://github.com)
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      const links = result.metadata.custom?.structure.links;
      expect(links).toHaveLength(2);
      expect(links[0].text).toBe('Google');
      expect(links[0].url).toBe('https://google.com');
      expect(links[1].text).toBe('GitHub');
      expect(links[1].url).toBe('https://github.com');
    });

    test('should extract images with alt text and URLs', async () => {
      const content = `![Logo](logo.png)
![Banner](banner.jpg)
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      const images = result.metadata.custom?.structure.images;
      expect(images).toHaveLength(2);
      expect(images[0].alt).toBe('Logo');
      expect(images[0].url).toBe('logo.png');
      expect(images[1].alt).toBe('Banner');
      expect(images[1].url).toBe('banner.jpg');
    });

    test('should extract code blocks with language', async () => {
      const content = `\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`python
print("hello")
\`\`\`

\`\`\`
no language
\`\`\`
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      const codeBlocks = result.metadata.custom?.structure.codeBlocks;
      expect(codeBlocks).toHaveLength(3);
      expect(codeBlocks[0].language).toBe('javascript');
      expect(codeBlocks[1].language).toBe('python');
      expect(codeBlocks[2].language).toBeUndefined();
    });

    test('should distinguish ordered and unordered lists', async () => {
      const content = `- Unordered 1
- Unordered 2

1. Ordered 1
2. Ordered 2
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      const lists = result.metadata.custom?.structure.lists;
      const unordered = lists.filter((l: any) => l.type === 'unordered');
      const ordered = lists.filter((l: any) => l.type === 'ordered');

      expect(unordered.length).toBeGreaterThan(0);
      expect(ordered.length).toBeGreaterThan(0);
    });

    test('should chunk large markdown when enabled', async () => {
      const content = '# Section\n\n' + 'Content. '.repeat(2000);
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        enableChunking: true,
        chunkSize: 1000,
        chunkOverlap: 100,
      });

      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });

    test('should handle empty markdown file', async () => {
      const content = '';
      const buffer = Buffer.from(content, 'utf-8');

      await expect(parser.parse(buffer, 'test.md')).rejects.toThrow(
        ValidationError
      );
    });

    test('should handle markdown with no H1', async () => {
      const content = '## H2 Only\n\nNo H1 here.';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.title).toBeUndefined();
      expect(result.metadata.custom?.title).toBeUndefined();
    });
  });

  describe('validation', () => {
    test('should reject empty files', async () => {
      const buffer = Buffer.alloc(0);

      await expect(parser.parse(buffer, 'test.md')).rejects.toThrow(
        ValidationError
      );
    });

    test('should reject files exceeding size limit', async () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      await expect(
        parser.parse(buffer, 'test.md', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).rejects.toThrow(ValidationError);
    });

    test('should accept files within size limit', async () => {
      const buffer = Buffer.from('# Test', 'utf-8');

      await expect(
        parser.parse(buffer, 'test.md', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('markdown elements', () => {
    test('should handle inline code', async () => {
      const content = 'Use `code` inline.';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('`code`');
    });

    test('should handle blockquotes', async () => {
      const content = '> This is a quote\n> Multi-line';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('>');
    });

    test('should handle horizontal rules', async () => {
      const content = '---\nContent\n***\nMore';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toBeDefined();
    });

    test('should handle nested lists', async () => {
      const content = `- Item 1
  - Nested 1
  - Nested 2
- Item 2
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('Item 1');
      expect(result.text).toContain('Nested 1');
    });

    test('should handle tables', async () => {
      const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('Header 1');
      expect(result.text).toContain('Cell 1');
    });

    test('should handle bold and italic', async () => {
      const content = '**bold** and *italic* and ***both***';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('**bold**');
      expect(result.text).toContain('*italic*');
    });

    test('should handle strikethrough', async () => {
      const content = '~~strikethrough~~';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('~~');
    });

    test('should handle task lists', async () => {
      const content = `- [x] Completed
- [ ] Todo
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('[x]');
      expect(result.text).toContain('[ ]');
    });
  });

  describe('special cases', () => {
    test('should handle markdown with HTML', async () => {
      const content = '# Title\n\n<div>HTML content</div>';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('<div>');
    });

    test('should handle markdown with emoji', async () => {
      const content = '# Title 😀\n\nEmoji in content 🎉';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('😀');
      expect(result.text).toContain('🎉');
    });

    test('should handle markdown with special characters', async () => {
      const content = '# Title\n\nSpecial: & < > " \' @#$%';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toContain('&');
      expect(result.text).toContain('<');
    });

    test('should handle very long lines', async () => {
      const content = '# Title\n\n' + 'a'.repeat(10000);
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(10000);
    });

    test('should handle markdown with front matter', async () => {
      const content = `---
title: Test
author: John
---

# Content
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md');

      // Front matter should be included in text
      expect(result.text).toBeDefined();
    });

    test('should handle README.md files', async () => {
      const content = `# Project Title

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

Example code here.
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'README.md', {
        extractMetadata: true,
      });

      expect(result.metadata.fileName).toBe('README.md');
      expect(result.metadata.title).toBe('Project Title');
      expect(result.metadata.custom?.structure.headings.length).toBeGreaterThan(
        0
      );
    });
  });

  describe('metadata extraction', () => {
    test('should extract correct heading count', async () => {
      const content = '# H1\n## H2\n### H3';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.custom?.headingCount).toBe(3);
    });

    test('should extract correct link count', async () => {
      const content = '[Link1](url1) [Link2](url2)';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.custom?.linkCount).toBe(2);
    });

    test('should extract correct code block count', async () => {
      const content = '```js\ncode1\n```\n\n```py\ncode2\n```';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
      });

      expect(result.metadata.custom?.codeBlockCount).toBe(2);
    });

    test('should include encoding in metadata', async () => {
      const buffer = Buffer.from('# Test', 'utf-8');

      const result = await parser.parse(buffer, 'test.md', {
        extractMetadata: true,
        encoding: 'utf-8',
      });

      expect(result.metadata.custom?.encoding).toBe('utf-8');
    });
  });

  describe('integration with options', () => {
    test('should apply all options correctly', async () => {
      const content = '# Title\n\n' + 'Content. '.repeat(2000);
      const buffer = Buffer.from(content, 'utf-8');

      const options: ParserOptions = {
        maxFileSizeBytes: 20000,
        enableChunking: true,
        chunkSize: 1000,
        chunkOverlap: 100,
        extractMetadata: true,
        encoding: 'utf-8',
        preserveFormatting: true,
      };

      const result = await parser.parse(buffer, 'test.md', options);

      expect(result.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });
  });
});
