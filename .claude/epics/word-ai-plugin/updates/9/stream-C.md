---
issue: 9
stream: Text & Data Parsers (TXT, MD, CSV)
agent: general-purpose
started: 2025-10-12T19:31:00Z
completed: 2025-10-12T20:45:00Z
status: completed
---

# Stream C: Text & Data Parsers (TXT, MD, CSV)

## Scope
Implement simpler text-based format parsers

## Files
- `backend/src/parsers/textParser.ts` (new)
- `backend/src/parsers/markdownParser.ts` (new)
- `backend/src/parsers/csvParser.ts` (new)

## Progress
- Starting implementation
- Implemented TextParser with encoding detection (UTF-8, ASCII, UTF-16)
- Implemented MarkdownParser with structure extraction (headings, code blocks, links, images, lists)
- Implemented CsvParser with automatic delimiter detection and structured data output
- Updated index.ts to export all three parsers
- All parsers extend BaseParser and use textChunker utility
- Completed implementation

## Implementation Details

### TextParser
- Extends BaseParser
- Supports multiple encodings (UTF-8, ASCII, UTF-16 with BOM detection)
- Automatic encoding detection
- Text chunking for large files
- Returns ParsedContent with text and metadata including encoding info

### MarkdownParser
- Extends BaseParser
- Preserves markdown structure in metadata
- Extracts document structure: headings, code blocks, links, images, lists
- Auto-extracts title from first H1 heading
- Optional formatting preservation
- Text chunking for large files

### CsvParser
- Extends BaseParser
- Automatic delimiter detection (comma, semicolon, tab, pipe)
- Supports headers and headerless CSVs
- Parses values to appropriate types (numbers, booleans, strings, null)
- Handles quoted fields with escaped quotes
- Returns both structuredData and flattened text representation
- Text chunking on flattened text

## Testing Notes
All parsers:
- Use this.wrapError() for error handling
- Use this.createBaseMetadata() for metadata
- Call super() in constructors with FileType array
- Support enableChunking option
- Follow existing BaseParser patterns
