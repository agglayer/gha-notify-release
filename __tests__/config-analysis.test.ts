/**
 * Unit tests for config analysis functionality
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock @actions/core
jest.unstable_mockModule('@actions/core', () => core)

// Import the module being tested
const { analyzeConfigChanges, formatConfigChangesForSlack } = await import(
  '../src/config-analysis.js'
)

describe('config-analysis.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('analyzeConfigChanges', () => {
    it('returns no config changes for empty or missing release notes', () => {
      const result1 = analyzeConfigChanges()
      const result2 = analyzeConfigChanges('')

      expect(result1.hasConfigChanges).toBe(false)
      expect(result2.hasConfigChanges).toBe(false)
      expect(result1.configLinks).toHaveLength(0)
      expect(result2.configDiffs).toHaveLength(0)
    })

    it('detects markdown links to config files', () => {
      const releaseNotes = `
        ## Configuration Updates
        
        Please update your configuration files:
        - [config.json](https://example.com/config.json) - Main configuration
        - [.env.example](https://github.com/repo/blob/main/.env.example) - Environment variables
        - [settings.yaml](./config/settings.yaml) - App settings
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configLinks).toHaveLength(3)
      expect(result.configLinks[0].filename).toBe('config.json')
      expect(result.configLinks[0].url).toBe('https://example.com/config.json')
      expect(result.configLinks[1].filename).toBe('.env.example')
      expect(result.configLinks[2].filename).toBe('settings.yaml')
    })

    it('detects config file diffs in code blocks', () => {
      const releaseNotes = `
        ## Configuration Changes
        
        Updated database configuration:
        
        \`\`\`diff
        {
          "database": {
        -   "host": "localhost",
        +   "host": "db.example.com",
            "port": 5432
          }
        }
        \`\`\`
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configDiffs).toHaveLength(1)
      expect(result.configDiffs[0].type).toBe('diff')
      expect(result.configDiffs[0].content).toContain('"database"')
    })

    it('detects before/after config sections', () => {
      const releaseNotes = `
        ## Database Configuration Update
        
        Before:
        \`\`\`json
        {
          "timeout": 30000
        }
        \`\`\`
        
        After:
        \`\`\`json
        {
          "timeout": 60000,
          "retries": 3
        }
        \`\`\`
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configDiffs).toHaveLength(1)
      expect(result.configDiffs[0].type).toBe('before-after')
      expect(result.configDiffs[0].content).toContain('timeout')
    })

    it('detects config mentions in bullet points', () => {
      const releaseNotes = `
        ## Changes
        
        - Added new user authentication
        - Configuration file updated with new API endpoints
        - Fixed memory leak in worker process
        - Settings.json modified to include new features
        - Environment variables changed for production deployment
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configDiffs.length).toBeGreaterThan(0)
      expect(result.configDiffs.some((d) => d.type === 'mention')).toBe(true)
    })

    it('detects YAML configuration content', () => {
      const releaseNotes = `
        Updated application config:
        
        \`\`\`yaml
        server:
          port: 8080
          host: 0.0.0.0
        database:
          connection_string: postgres://...
        \`\`\`
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configDiffs).toHaveLength(1)
      expect(result.configDiffs[0].content).toContain('server:')
    })

    it('detects environment variable configuration', () => {
      const releaseNotes = `
        Environment changes needed:
        
        \`\`\`
        DATABASE_URL=postgres://localhost:5432/mydb
        API_KEY=your-api-key-here
        DEBUG=true
        \`\`\`
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configDiffs).toHaveLength(1)
      expect(result.configDiffs[0].content).toContain('DATABASE_URL=')
    })

    it('does not detect false positives', () => {
      const releaseNotes = `
        ## Regular Updates
        
        - Fixed bug in user interface
        - Improved performance of data processing
        - Updated documentation
        - Added new feature for file uploads
        - Resolved security vulnerability
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(false)
      expect(result.configLinks).toHaveLength(0)
      expect(result.configDiffs).toHaveLength(0)
    })

    it('handles mixed config content types', () => {
      const releaseNotes = `
        ## Configuration Updates Required
        
        Please review:
        - [Updated config.json](https://example.com/config.json)
        - Configuration settings changed for new feature
        
        Database diff:
        \`\`\`diff
        - connection_timeout: 30
        + connection_timeout: 60
        \`\`\`
      `

      const result = analyzeConfigChanges(releaseNotes)

      expect(result.hasConfigChanges).toBe(true)
      expect(result.configLinks).toHaveLength(1)
      expect(result.configDiffs).toHaveLength(2) // One mention + one diff
    })
  })

  describe('formatConfigChangesForSlack', () => {
    it('returns empty string when no config changes', () => {
      const analysis = {
        hasConfigChanges: false,
        configLinks: [],
        configDiffs: []
      }

      const result = formatConfigChangesForSlack(analysis)
      expect(result).toBe('')
    })

    it('formats config file links', () => {
      const analysis = {
        hasConfigChanges: true,
        configLinks: [
          {
            text: 'config.json',
            url: 'https://example.com/config.json',
            filename: 'config.json'
          },
          {
            text: '.env.example',
            url: 'https://github.com/repo/.env.example',
            filename: '.env.example'
          }
        ],
        configDiffs: []
      }

      const result = formatConfigChangesForSlack(analysis)

      expect(result).toContain('⚙️ *CONFIGURATION CHANGES*')
      expect(result).toContain('*Configuration Files:*')
      expect(result).toContain('<https://example.com/config.json|config.json>')
      expect(result).toContain(
        '<https://github.com/repo/.env.example|.env.example>'
      )
      expect(result).toContain(
        '📋 *Review configuration changes before deploying!*'
      )
    })

    it('formats config diff mentions', () => {
      const analysis = {
        hasConfigChanges: true,
        configLinks: [],
        configDiffs: [
          {
            filename: 'config.json',
            content: 'diff content here',
            type: 'diff' as const
          },
          {
            filename: 'Configuration mention',
            content: '- Configuration file updated with new settings',
            type: 'mention' as const
          }
        ]
      }

      const result = formatConfigChangesForSlack(analysis)

      expect(result).toContain('*Configuration Updates:*')
      expect(result).toContain('• config.json - See release notes for details')
      expect(result).toContain(
        '• - Configuration file updated with new settings'
      )
    })

    it('formats both links and diffs', () => {
      const analysis = {
        hasConfigChanges: true,
        configLinks: [
          {
            text: 'config.yaml',
            url: 'https://example.com/config.yaml',
            filename: 'config.yaml'
          }
        ],
        configDiffs: [
          {
            filename: 'database.json',
            content: 'diff content',
            type: 'diff' as const
          }
        ]
      }

      const result = formatConfigChangesForSlack(analysis)

      expect(result).toContain('*Configuration Files:*')
      expect(result).toContain('*Configuration Updates:*')
      expect(result).toContain('config.yaml')
      expect(result).toContain('database.json')
    })
  })
})
