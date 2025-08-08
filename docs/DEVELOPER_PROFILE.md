# Developer Profile

This document outlines the development environment, tools, and conventions used in this project.

## Project Overview

**Upwork Job Monitor** is a browser extension that automatically monitors Upwork for new job opportunities matching user-defined criteria. It helps freelancers stay on top of new job postings without constantly refreshing the Upwork website.

### Key Features
- **Automatic Monitoring**: Checks for new jobs every 3 minutes using Upwork's GraphQL API
- **Direct API Integration**: Bypasses Cloudflare protection by operating within authenticated browser sessions
- **Smart Filtering**: User-defined search queries with priority tagging
- **Real-time Notifications**: Audio alerts and visual indicators for new jobs
- **Cross-browser Support**: Works with Chrome and Firefox

## Environment and Tooling

- **OS**: Windows 11
- **Default Shell**: PowerShell (PS)
- **Node.js**: v20.11.1
- **npm**: v10.2.4
- **Editor**: Visual Studio Code

**Note**: All `npm` scripts in `package.json` are PowerShell-friendly and tested for compatibility.

## Technology Stack

### Core Technologies
- **TypeScript**: Primary language for type safety and better development experience
- **ES6 Modules**: Modern JavaScript module system
- **Browser Extension APIs**: Chrome and Firefox extension APIs
- **GraphQL**: Direct API integration with Upwork

### Build Tools
- **esbuild**: Fast TypeScript compilation and bundling
- **ESLint**: Code linting and style enforcement
- **Jest**: Unit testing framework
- **npm**: Package management

## PowerShell Command Chaining

For efficiency, developers are encouraged to chain commands. Here are common patterns:

### Sequential Execution

Use the semicolon (`;`) to run commands sequentially, regardless of whether the previous one succeeds or fails.

```powershell
npm run lint; npm run build
```

### Stop on Error

Use the `&&` operator to chain commands, where the next command only runs if the previous one succeeds. This is ideal for CI/CD or pre-commit hooks.

```powershell
npm run lint && npm run build && npm run test
```

### Line Continuation

For long commands, use the backtick (`` ` ``) to improve readability by splitting the command across multiple lines.

```powershell
npm run lint `
; npm run build `
; npm run test
```

### GitHub CLI Example

Chain `gh` commands to quickly get a snapshot of a repository and pull request:

```powershell
gh repo view --json name,owner,url,defaultBranchRef; gh pr status; gh pr view 56 --json number,title,state,headRefName,baseRefName,url
```

## VS Code Extensions

- **ESLint**: Integrates ESLint into VS Code.
- **Prettier - Code formatter**: For consistent code formatting.
- **GitLens — Git supercharged**: Enhances Git capabilities within the editor.
- **Jest**: For running tests.
- **Code Spell Checker**: To catch typos in code and documentation.

## Development Commands

```bash
npm run build          # Build the extension
npm run clean          # Clean build artifacts
npm run type-check     # TypeScript type checking
npm run lint           # ESLint code linting
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run package        # Package the extension into a ZIP file
```

## Coding Standards

### TypeScript Guidelines
- **Strict Mode**: Always use strict TypeScript configuration
- **No `any` Type**: Avoid using `any` type - define proper interfaces
- **No Non-null Assertion**: Avoid `!` operator - use proper null checks
- **No Type Casting**: Avoid `as unknown as T` patterns
- **String Standards**: Use double quotes (`"`) for strings
- **Template Literals**: Use string templates instead of concatenation

### Code Style
- **Consistent Indentation**: 2 spaces
- **Semicolons**: Always use semicolons
- **Trailing Commas**: Use trailing commas in objects and arrays
- **Line Length**: Maximum 100 characters
- **Function Naming**: Use descriptive names, prefer verbs

## Project Structure

```
upwork-job-monitor/
├── src/                          # Source code
│   ├── background/               # Service worker and background logic
│   ├── popup/                    # Popup UI components
│   │   ├── components/           # React-like components
│   │   ├── services/             # API and data services
│   │   └── state/                # Application state management
│   ├── storage/                  # Data persistence layer
│   ├── utils/                    # Utility functions
│   └── types.ts                  # TypeScript type definitions
├── docs/                         # Documentation
├── dist/                         # Compiled output
└── llm_context/                  # AI/LLM context files
```

## Contributing Guidelines

### Before Contributing
1. **Read Documentation**: Understand the project structure
2. **Check Issues**: Look for existing issues or discussions
3. **Follow Standards**: Adhere to coding and style guidelines
4. **Test Thoroughly**: Ensure changes work as expected

### Code Review Checklist
- [ ] Code follows TypeScript standards
- [ ] No linting errors
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Security considerations addressed
- [ ] Performance impact assessed

---

*This document is maintained by the project maintainers and should be updated as the project evolves.*
