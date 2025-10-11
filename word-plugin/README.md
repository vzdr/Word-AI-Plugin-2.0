# Word AI Plugin

AI-powered Word plugin that enables users to select text, provide context through uploaded files or inline input, and get AI-powered answers that replace the selected text or fill table cells.

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Microsoft Word (Desktop or Online)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Generate development certificates (first time only):
```bash
npx office-addin-dev-certs install
```

### Development

1. Start the development server:
```bash
npm run dev-server
```

2. In another terminal, sideload the plugin in Word:
```bash
npm start
```

This will:
- Start webpack dev server on https://localhost:3000
- Open Word with the plugin loaded
- Enable hot reload for development

### Building

Production build:
```bash
npm run build
```

Development build:
```bash
npm run build:dev
```

### Testing in Word

#### Word Desktop:
```bash
npm start
```

#### Word Online:
1. Upload the manifest.xml to your add-in catalog
2. Insert the add-in from "My Add-ins"

### Project Structure

```
word-plugin/
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html
│   │   ├── taskpane.tsx
│   │   ├── App.tsx
│   │   └── App.css
│   └── commands/
│       ├── commands.html
│       └── commands.ts
├── assets/
│   └── (icons)
├── dist/
│   └── (build output)
├── manifest.xml
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Current Features

- ✅ Plugin loads in Word Desktop and Online
- ✅ React 18 with TypeScript
- ✅ Text selection from Word document
- ✅ Hot reload development environment
- ⏳ Context file upload (coming next)
- ⏳ Inline context input (coming next)
- ⏳ AI integration (coming next)
- ⏳ Table auto-fill (coming next)

## Technologies

- **Office.js** - Word integration
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Webpack** - Build system
- **Fluent UI** - Microsoft design system

## Development Commands

- `npm run dev-server` - Start development server with hot reload
- `npm start` - Sideload plugin in Word Desktop
- `npm run build` - Production build
- `npm run validate` - Validate manifest.xml
- `npm stop` - Stop plugin debugging

## Troubleshooting

### Plugin doesn't load
- Ensure dev certificates are installed: `npx office-addin-dev-certs install`
- Check that dev server is running on https://localhost:3000
- Clear Office cache and restart Word

### Hot reload not working
- Restart the dev server
- Clear browser cache
- Check webpack dev server logs

## Next Steps

See [GitHub Issues](https://github.com/vzdr/word-ai-plugin/issues) for upcoming features and tasks.
