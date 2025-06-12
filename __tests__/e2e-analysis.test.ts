/**
 * Unit tests for e2e workflow analysis functionality
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock dependencies
jest.unstable_mockModule('@actions/core', () => core)

// Import the module being tested
const { analyzeE2ETests, formatE2ETestsForSlack } = await import(
  '../src/e2e-analysis.js'
)

describe('e2e-analysis.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('analyzeE2ETests', () => {
    it('returns no e2e workflows for empty or missing release notes', () => {
      expect(analyzeE2ETests()).toEqual({
        hasE2ETests: false,
        e2eWorkflowLinks: []
      })

      expect(analyzeE2ETests('')).toEqual({
        hasE2ETests: false,
        e2eWorkflowLinks: []
      })

      expect(
        analyzeE2ETests('Just a regular release with no workflow info')
      ).toEqual({
        hasE2ETests: false,
        e2eWorkflowLinks: []
      })
    })

    it('detects GitHub Actions workflow run URLs with e2e context and passed status', () => {
      const releaseNotes = `
        ## Testing
        
        E2E workflow completed successfully!
        
        Check the workflow run: https://github.com/owner/repo/actions/runs/123456789
        
        All e2e tests passed.
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(true)
      expect(result.e2eWorkflowLinks).toHaveLength(1)
      expect(result.e2eWorkflowLinks[0]).toEqual({
        url: 'https://github.com/owner/repo/actions/runs/123456789',
        workflowName: expect.stringMatching(/e2e/i),
        repository: 'owner/repo',
        status: 'passed',
        type: 'workflow_run'
      })
    })

    it('detects workflow run URLs with failed status', () => {
      const releaseNotes = `
        ## Testing
        
        E2E workflow failed during testing.
        
        Check the workflow run: https://github.com/owner/repo/actions/runs/987654321
        
        The e2e tests had errors.
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(true)
      expect(result.e2eWorkflowLinks).toHaveLength(1)
      expect(result.e2eWorkflowLinks[0].status).toBe('failed')
    })

    it('detects workflow run URLs with unknown status', () => {
      const releaseNotes = `
        ## Testing
        
        E2E workflow completed.
        
        Check the workflow run: https://github.com/owner/repo/actions/runs/555666777
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(true)
      expect(result.e2eWorkflowLinks).toHaveLength(1)
      expect(result.e2eWorkflowLinks[0].status).toBe('unknown')
    })

    it('detects GitHub Actions workflow file URLs for e2e workflows', () => {
      const releaseNotes = `
        ## CI/CD Updates
        
        Updated e2e testing workflow: https://github.com/owner/repo/actions/workflows/e2e-tests.yml
        
        Also check: https://github.com/owner/repo/actions/workflows/integration-test.yaml
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(true)
      expect(result.e2eWorkflowLinks).toHaveLength(2)
      expect(result.e2eWorkflowLinks[0]).toEqual({
        url: 'https://github.com/owner/repo/actions/workflows/e2e-tests.yml',
        workflowName: 'E2e Tests',
        repository: 'owner/repo',
        status: 'unknown',
        type: 'workflow_file'
      })
      expect(result.e2eWorkflowLinks[1]).toEqual({
        url: 'https://github.com/owner/repo/actions/workflows/integration-test.yaml',
        workflowName: 'Integration Test',
        repository: 'owner/repo',
        status: 'unknown',
        type: 'workflow_file'
      })
    })

    it('handles mixed workflow content types', () => {
      const releaseNotes = `
        ## Release v2.0.0
        
        ### E2E Testing
        E2E workflow completed successfully.
        
        See workflow: https://github.com/owner/repo/actions/runs/987654321
        
        Updated workflow file: https://github.com/owner/repo/actions/workflows/e2e.yml
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(true)
      expect(result.e2eWorkflowLinks).toHaveLength(2)
      expect(result.e2eWorkflowLinks[0].type).toBe('workflow_run')
      expect(result.e2eWorkflowLinks[1].type).toBe('workflow_file')
    })

    it('does not detect false positives', () => {
      const releaseNotes = `
        ## New Features
        
        - Added user authentication
        - Improved database performance
        - Fixed memory leak in production
        - Updated dependencies
        
        https://github.com/owner/repo/pulls/123 - Just a regular PR link
        https://external-site.com/some-page - External link
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(false)
      expect(result.e2eWorkflowLinks).toHaveLength(0)
    })

    it('ignores workflow URLs without e2e context', () => {
      const releaseNotes = `
        ## CI Updates
        
        Build workflow updated: https://github.com/owner/repo/actions/runs/123456789
        
        This is just about deployment, no testing mentioned.
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(false)
      expect(result.e2eWorkflowLinks).toHaveLength(0)
    })

    it('ignores non-e2e workflow files', () => {
      const releaseNotes = `
        ## CI Updates
        
        Updated build workflow: https://github.com/owner/repo/actions/workflows/build.yml
        Updated deploy workflow: https://github.com/owner/repo/actions/workflows/deploy.yaml
      `

      const result = analyzeE2ETests(releaseNotes)

      expect(result.hasE2ETests).toBe(false)
      expect(result.e2eWorkflowLinks).toHaveLength(0)
    })
  })

  describe('formatE2ETestsForSlack', () => {
    it('returns empty string when no e2e workflows', () => {
      const analysis = {
        hasE2ETests: false,
        e2eWorkflowLinks: []
      }

      const result = formatE2ETestsForSlack(analysis)

      expect(result).toBe('')
    })

    it('formats workflow links with status', () => {
      const analysis = {
        hasE2ETests: true,
        e2eWorkflowLinks: [
          {
            url: 'https://github.com/owner/repo/actions/runs/123456',
            workflowName: 'E2E Tests',
            repository: 'owner/repo',
            status: 'passed' as const,
            type: 'workflow_run' as const
          },
          {
            url: 'https://github.com/owner/repo/actions/workflows/e2e.yml',
            workflowName: 'E2E Workflow',
            repository: 'owner/repo',
            status: 'unknown' as const,
            type: 'workflow_file' as const
          }
        ]
      }

      const result = formatE2ETestsForSlack(analysis)

      expect(result).toContain('🧪 *E2E WORKFLOWS DETECTED*')
      expect(result).toContain(
        '🔄 <https://github.com/owner/repo/actions/runs/123456|E2E Tests> (owner/repo)'
      )
      expect(result).toContain('✅ Status: *Passed*')
      expect(result).toContain(
        '📋 <https://github.com/owner/repo/actions/workflows/e2e.yml|E2E Workflow> (owner/repo)'
      )
      expect(result).toContain('❔ Status: *Unknown*')
    })

    it('formats failed workflow status', () => {
      const analysis = {
        hasE2ETests: true,
        e2eWorkflowLinks: [
          {
            url: 'https://github.com/owner/repo/actions/runs/123456',
            workflowName: 'E2E Tests',
            repository: 'owner/repo',
            status: 'failed' as const,
            type: 'workflow_run' as const
          }
        ]
      }

      const result = formatE2ETestsForSlack(analysis)

      expect(result).toContain('❌ Status: *Failed*')
    })

    it('handles multiple workflows with different statuses', () => {
      const analysis = {
        hasE2ETests: true,
        e2eWorkflowLinks: [
          {
            url: 'https://github.com/owner/repo/actions/runs/111',
            workflowName: 'E2E Tests',
            repository: 'owner/repo',
            status: 'passed' as const,
            type: 'workflow_run' as const
          },
          {
            url: 'https://github.com/owner/repo/actions/runs/222',
            workflowName: 'Integration Tests',
            repository: 'owner/repo',
            status: 'failed' as const,
            type: 'workflow_run' as const
          },
          {
            url: 'https://github.com/owner/repo/actions/runs/333',
            workflowName: 'End to End',
            repository: 'owner/repo',
            status: 'unknown' as const,
            type: 'workflow_run' as const
          }
        ]
      }

      const result = formatE2ETestsForSlack(analysis)

      expect(result).toContain('✅ Status: *Passed*')
      expect(result).toContain('❌ Status: *Failed*')
      expect(result).toContain('❔ Status: *Unknown*')
    })
  })
})
