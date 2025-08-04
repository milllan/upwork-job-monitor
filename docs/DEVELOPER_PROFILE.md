# Developer Profile

This document outlines the development environment, tools, and conventions used in this project.

## Environment and Tooling

- **OS**: Windows 11
- **Default Shell**: PowerShell (PS)
- **Node.js**: v20.11.1
- **npm**: v10.2.4
- **Editor**: Visual Studio Code

**Note**: All `npm` scripts in `package.json` are PowerShell-friendly and tested for compatibility.

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

## Scripts

- `npm run lint`: Lints the codebase using ESLint.
- `npm test`: Runs all tests.
- `npm run build`: Creates a production-ready build.
- `npm run package`: Packages the extension into a ZIP file for distribution.
