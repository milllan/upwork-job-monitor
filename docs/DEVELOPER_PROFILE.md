# Developer Profile - Upwork Job Monitor

## Project Overview

**Upwork Job Monitor** is a browser extension that automatically monitors Upwork for new job opportunities matching user-defined criteria. It helps freelancers stay on top of new job postings without constantly refreshing the Upwork website.

### Key Features
- **Automatic Monitoring**: Checks for new jobs every 3 minutes using Upwork's GraphQL API
- **Direct API Integration**: Bypasses Cloudflare protection by operating within authenticated browser sessions
- **Smart Filtering**: User-defined search queries with priority tagging
- **Real-time Notifications**: Audio alerts and visual indicators for new jobs
- **Cross-browser Support**: Works with Chrome and Firefox

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

### Architecture
- **Service Worker**: Background monitoring and API calls
- **Popup UI**: User interface for configuration and job display
- **Content Script**: Upwork page integration
- **Storage API**: Persistent data management

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
├── tests/                        # Test files
└── llm_context/                  # AI/LLM context files
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

### Error Handling
- **Try-Catch Blocks**: Wrap async operations in try-catch
- **Error Messages**: Provide meaningful error messages
- **Graceful Degradation**: Handle failures gracefully
- **User Feedback**: Always inform users of errors

### Testing Standards
- **Unit Tests**: Write tests for utility functions
- **Integration Tests**: Test component interactions
- **Mocking**: Mock external dependencies
- **Coverage**: Aim for 80%+ test coverage

## Development Workflow

### Getting Started
1. **Clone Repository**: `git clone https://github.com/milllan/upwork-job-monitor.git`
2. **Install Dependencies**: `npm install`
3. **Build Project**: `npm run build`
4. **Load Extension**: Load `dist/` folder in browser extension manager

### Development Commands
```bash
npm run build          # Build the extension
npm run clean          # Clean build artifacts
npm run type-check     # TypeScript type checking
npm run lint           # ESLint code linting
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
```

### Branch Strategy
- **main**: Production-ready code
- **feature/***: New features and enhancements
- **fix/***: Bug fixes and patches
- **docs/***: Documentation updates
- **refactor/***: Code refactoring

### Pull Request Process
1. **Create Issue**: Document the problem or feature
2. **Create Branch**: Use descriptive branch names
3. **Implement Changes**: Follow coding standards
4. **Write Tests**: Add tests for new functionality
5. **Update Documentation**: Update relevant docs
6. **Submit PR**: Create pull request with clear description
7. **Code Review**: Address review feedback
8. **Merge**: Squash and merge when approved

## API Integration

### Upwork API
- **GraphQL Endpoints**: Direct integration with Upwork's GraphQL API
- **Authentication**: Uses browser session cookies
- **Rate Limiting**: Respects API rate limits
- **Error Handling**: Graceful handling of API failures

### Browser Extension APIs
- **Storage API**: Persistent data storage
- **Tabs API**: Tab management and communication
- **Runtime API**: Extension lifecycle management
- **Notifications API**: User notifications

## Security Considerations

### Data Privacy
- **Local Storage**: Sensitive data stored locally only
- **No External Services**: No data sent to external services
- **User Consent**: Clear user consent for data collection
- **Data Minimization**: Only collect necessary data

### Code Security
- **Input Validation**: Validate all user inputs
- **XSS Prevention**: Sanitize HTML content
- **CSP Headers**: Content Security Policy compliance
- **Dependency Scanning**: Regular security audits

## Performance Guidelines

### Extension Performance
- **Minimal Memory Usage**: Efficient memory management
- **Fast Startup**: Quick extension initialization
- **Responsive UI**: Smooth user interface interactions
- **Background Efficiency**: Minimal background processing

### Code Optimization
- **Bundle Size**: Keep compiled bundle small
- **Lazy Loading**: Load components on demand
- **Caching**: Implement appropriate caching strategies
- **Debouncing**: Debounce frequent operations

## Troubleshooting

### Common Issues
1. **Build Failures**: Check TypeScript errors and dependencies
2. **Extension Not Loading**: Verify manifest.json and build output
3. **API Errors**: Check network connectivity and authentication
4. **UI Issues**: Verify CSS and JavaScript console errors

### Debug Tools
- **Browser DevTools**: Use extension debugging
- **Console Logging**: Strategic console.log statements
- **Network Tab**: Monitor API requests
- **Storage Tab**: Check data persistence

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

### Release Process
1. **Version Bump**: Update version in package.json and manifest.json
2. **Changelog**: Update CHANGELOG.md
3. **Tag Release**: Create git tag for version
4. **Build Artifacts**: Generate distribution files
5. **Publish**: Release to extension stores

## Contact & Support

### Getting Help
- **GitHub Issues**: Report bugs and request features
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check docs/ folder for guides
- **Code Examples**: Review existing code for patterns

### Community Guidelines
- **Be Respectful**: Treat all contributors with respect
- **Be Helpful**: Provide constructive feedback
- **Be Patient**: Allow time for responses
- **Be Collaborative**: Work together to improve the project

---

*This document is maintained by the project maintainers and should be updated as the project evolves.*
