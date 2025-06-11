/**
 * Unit tests for breaking change analysis functionality
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock @actions/core
jest.unstable_mockModule('@actions/core', () => core)

// Import the module being tested
const { analyzeBreakingChanges, formatBreakingChangesForSlack } = await import(
  '../src/breaking-changes.js'
)

describe('breaking-changes.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('analyzeBreakingChanges', () => {
    it('returns no breaking changes for empty or missing release notes', () => {
      const result1 = analyzeBreakingChanges()
      const result2 = analyzeBreakingChanges('')

      expect(result1.hasBreakingChanges).toBe(false)
      expect(result2.hasBreakingChanges).toBe(false)
      expect(result1.breakingChangeMarkers).toHaveLength(0)
      expect(result2.breakingChangeMarkers).toHaveLength(0)
    })

    it('detects conventional commit breaking changes with !', () => {
      const releaseNotes = `
        ## Commits
        - feat!: redesign authentication system
        - fix: resolve memory leak
        - chore!: update dependencies with breaking API changes
        - docs: update README
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(true)
      expect(result.conventionalCommitBreaks).toHaveLength(2)
      expect(result.conventionalCommitBreaks[0]).toContain(
        'feat!: redesign authentication system'
      )
      expect(result.conventionalCommitBreaks[1]).toContain(
        'chore!: update dependencies with breaking API changes'
      )
      expect(result.breakingChangeMarkers).toContain(
        'Conventional commit breaking change: feat!'
      )
      expect(result.breakingChangeMarkers).toContain(
        'Conventional commit breaking change: chore!'
      )
    })

    it('detects explicit BREAKING CHANGE sections', () => {
      const releaseNotes = `
        ## What's New
        - Added new features
        
        ## BREAKING CHANGES
        - Removed legacy /v1 API endpoints
        - Changed response format for all user endpoints
        
        ## Bug Fixes
        - Fixed memory leak
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(true)
      expect(result.releaseNoteBreaks).toHaveLength(2)
      expect(result.releaseNoteBreaks[0]).toContain(
        'Removed legacy /v1 API endpoints'
      )
      expect(result.releaseNoteBreaks[1]).toContain(
        'Changed response format for all user endpoints'
      )
      expect(result.breakingChangeMarkers).toContain(
        'BREAKING CHANGE section found'
      )
    })

    it('detects breaking change keywords in bullet points', () => {
      const releaseNotes = `
        ## Changes
        - Added new dashboard
        - Removed authentication methods
        - Fixed bug in user profile
        - Major change: updated response format
        - No longer supports Node.js < 16
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(true)
      expect(result.releaseNoteBreaks.length).toBeGreaterThan(0)
      expect(result.breakingChangeMarkers).toContain(
        'Breaking change keyword detected'
      )
    })

    it('detects major version bumps', () => {
      const releaseNotes = `
        Release version v3.0.0 includes major improvements and breaking changes.
        Upgrading from v2.x.x requires migration.
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(true)
      expect(result.breakingChangeMarkers).toContain(
        'Major version bump detected'
      )
    })

    it('handles multiple types of breaking changes', () => {
      const releaseNotes = `
        ## Version 2.0.0 Release Notes
        
        ### Features
        - feat!: new authentication system
        - Added user dashboard
        
        ## BREAKING CHANGES
        - Removed legacy endpoints
        - Changed API response format
        
        ### Other Changes
        - No longer supports IE11
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(true)
      expect(result.conventionalCommitBreaks.length).toBeGreaterThan(0)
      expect(result.releaseNoteBreaks.length).toBeGreaterThan(0)
      expect(result.breakingChangeMarkers.length).toBeGreaterThan(2)
    })

    it('does not detect false positives', () => {
      const releaseNotes = `
        ## Regular Release v1.2.3
        
        ### Features
        - feat: add new user preferences
        - improvement: better error messages
        
        ### Bug Fixes
        - fix: resolve login issue
        - fix: update warning message for deprecated methods
        
        ### Documentation
        - Updated API documentation
        - Fixed broken links
        - Note: Some methods are deprecated but still supported
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(false)
      expect(result.conventionalCommitBreaks).toHaveLength(0)
      expect(result.releaseNoteBreaks).toHaveLength(0)
    })

    it('ignores v1.0.0 as non-breaking', () => {
      const releaseNotes = `
        Initial release version v1.0.0 with basic features.
      `

      const result = analyzeBreakingChanges(releaseNotes)

      expect(result.hasBreakingChanges).toBe(false)
      expect(result.breakingChangeMarkers).not.toContain(
        'Major version bump detected'
      )
    })
  })

  describe('formatBreakingChangesForSlack', () => {
    it('returns empty string when no breaking changes', () => {
      const analysis = {
        hasBreakingChanges: false,
        breakingChangeMarkers: [],
        conventionalCommitBreaks: [],
        releaseNoteBreaks: []
      }

      const result = formatBreakingChangesForSlack(analysis)
      expect(result).toBe('')
    })

    it('formats conventional commit breaking changes', () => {
      const analysis = {
        hasBreakingChanges: true,
        breakingChangeMarkers: ['test'],
        conventionalCommitBreaks: ['feat!: new API', 'chore!: update deps'],
        releaseNoteBreaks: []
      }

      const result = formatBreakingChangesForSlack(analysis)

      expect(result).toContain('⚠️ *BREAKING CHANGES DETECTED*')
      expect(result).toContain('*Conventional Commit Breaking Changes:*')
      expect(result).toContain('• feat!: new API')
      expect(result).toContain('• chore!: update deps')
      expect(result).toContain(
        '🔍 *Please review the changes carefully before updating!*'
      )
    })

    it('formats release note breaking changes', () => {
      const analysis = {
        hasBreakingChanges: true,
        breakingChangeMarkers: ['test'],
        conventionalCommitBreaks: [],
        releaseNoteBreaks: ['Removed old API', 'Changed response format']
      }

      const result = formatBreakingChangesForSlack(analysis)

      expect(result).toContain('⚠️ *BREAKING CHANGES DETECTED*')
      expect(result).toContain('*Breaking Changes from Release Notes:*')
      expect(result).toContain('• Removed old API')
      expect(result).toContain('• Changed response format')
    })

    it('formats both types of breaking changes', () => {
      const analysis = {
        hasBreakingChanges: true,
        breakingChangeMarkers: ['test'],
        conventionalCommitBreaks: ['feat!: new system'],
        releaseNoteBreaks: ['Removed legacy support']
      }

      const result = formatBreakingChangesForSlack(analysis)

      expect(result).toContain('*Conventional Commit Breaking Changes:*')
      expect(result).toContain('*Breaking Changes from Release Notes:*')
      expect(result).toContain('• feat!: new system')
      expect(result).toContain('• Removed legacy support')
    })
  })
})
