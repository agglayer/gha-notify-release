import * as core from '@actions/core'

/**
 * Represents the result of analyzing release notes for e2e workflow references
 */
export interface E2ETestAnalysis {
  hasE2ETests: boolean
  e2eWorkflowLinks: E2EWorkflowLink[]
}

/**
 * Represents a GitHub Actions workflow link found in release notes
 */
export interface E2EWorkflowLink {
  url: string
  workflowName: string
  repository: string
  status: 'passed' | 'failed' | 'unknown'
  type: 'workflow_run' | 'workflow_file'
}

/**
 * Analyzes release notes for e2e workflow links
 */
export function analyzeE2ETests(releaseNotes?: string): E2ETestAnalysis {
  if (!releaseNotes) {
    return {
      hasE2ETests: false,
      e2eWorkflowLinks: []
    }
  }

  core.debug('Analyzing release notes for e2e workflow references')

  const workflowLinks = findE2EWorkflowLinks(releaseNotes)

  const hasE2ETests = workflowLinks.length > 0

  if (hasE2ETests) {
    core.info(`Found ${workflowLinks.length} e2e workflow links`)
  }

  return {
    hasE2ETests,
    e2eWorkflowLinks: workflowLinks
  }
}

/**
 * Finds GitHub Actions workflow links related to e2e testing
 */
function findE2EWorkflowLinks(releaseNotes: string): E2EWorkflowLink[] {
  const links: E2EWorkflowLink[] = []

  // Pattern for GitHub Actions workflow run URLs
  const workflowRunPattern =
    /https:\/\/github\.com\/([^\/]+\/[^\/]+)\/actions\/runs\/(\d+)/gi

  // Pattern for GitHub Actions workflow file URLs
  const workflowFilePattern =
    /https:\/\/github\.com\/([^\/]+\/[^\/]+)\/actions\/workflows\/([^?\s]+)/gi

  // Find workflow run links
  let match
  while ((match = workflowRunPattern.exec(releaseNotes)) !== null) {
    const repository = match[1]
    const runId = match[2]

    // Try to determine if it's an e2e test workflow from context
    const contextStart = Math.max(0, match.index - 100)
    const contextEnd = Math.min(
      releaseNotes.length,
      match.index + match[0].length + 100
    )
    const context = releaseNotes.slice(contextStart, contextEnd).toLowerCase()

    if (isE2EWorkflowContext(context)) {
      const workflowName =
        extractWorkflowNameFromContext(context) || `E2E Workflow Run #${runId}`
      const status = determineWorkflowStatus(context)

      links.push({
        url: match[0],
        workflowName,
        repository,
        status,
        type: 'workflow_run'
      })
    }
  }

  // Find workflow file links
  workflowFilePattern.lastIndex = 0 // Reset regex
  while ((match = workflowFilePattern.exec(releaseNotes)) !== null) {
    const repository = match[1]
    const workflowFile = match[2]

    if (isE2EWorkflowFile(workflowFile)) {
      const workflowName = workflowFile
        .replace(/\.ya?ml$/, '')
        .replace(/[-_]/g, ' ')

      links.push({
        url: match[0],
        workflowName: formatWorkflowName(workflowName),
        repository,
        status: 'unknown',
        type: 'workflow_file'
      })
    }
  }

  return links
}

/**
 * Determines if the context around a URL suggests it's related to e2e testing
 */
function isE2EWorkflowContext(context: string): boolean {
  const e2eKeywords = [
    'e2e',
    'end-to-end',
    'integration test',
    'e2e test',
    'e2e workflow'
  ]

  return e2eKeywords.some((keyword) => context.includes(keyword))
}

/**
 * Determines if a workflow file is likely an e2e test workflow
 */
function isE2EWorkflowFile(filename: string): boolean {
  const e2eWorkflowPatterns = [/e2e/i, /end-to-end/i, /integration.test/i]

  return e2eWorkflowPatterns.some((pattern) => pattern.test(filename))
}

/**
 * Determines the status of a workflow from context
 */
function determineWorkflowStatus(
  context: string
): 'passed' | 'failed' | 'unknown' {
  const passKeywords = [
    'passed',
    'success',
    'successful',
    'green',
    'completed successfully'
  ]
  const failKeywords = ['failed', 'failure', 'error', 'red', 'unsuccessful']

  const hasPassKeyword = passKeywords.some((keyword) =>
    context.includes(keyword)
  )
  const hasFailKeyword = failKeywords.some((keyword) =>
    context.includes(keyword)
  )

  if (hasPassKeyword && !hasFailKeyword) {
    return 'passed'
  } else if (hasFailKeyword && !hasPassKeyword) {
    return 'failed'
  }

  return 'unknown'
}

/**
 * Extracts workflow name from surrounding context
 */
function extractWorkflowNameFromContext(context: string): string | null {
  // Look for workflow name patterns like "E2E Tests" or "Integration Testing"
  const namePatterns = [
    /(?:workflow|action|job)[\s]*:[\s]*([^\n\r]+)/i,
    /([^\n\r]*(?:e2e|integration)[^\n\r]*)/i
  ]

  for (const pattern of namePatterns) {
    const match = pattern.exec(context)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  return null
}

/**
 * Formats workflow name for display
 */
function formatWorkflowName(name: string): string {
  return name
    .split(/[\s-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Formats e2e workflow information for Slack notification
 */
export function formatE2ETestsForSlack(analysis: E2ETestAnalysis): string {
  if (!analysis.hasE2ETests) {
    return ''
  }

  let message = '\n\n\n🧪 *E2E WORKFLOWS DETECTED*\n\n'

  analysis.e2eWorkflowLinks.forEach((link) => {
    const statusIcon = getStatusIcon(link.status)

    // Simplify link text based on status
    let linkText = 'E2E workflow run'
    if (link.status === 'passed') {
      linkText = 'Passing e2e ci run'
    } else if (link.status === 'failed') {
      linkText = 'Failed e2e ci run'
    }

    message += `${statusIcon} <${link.url}|${linkText}> (${link.repository})\n`
    message += `${statusIcon} Status: ${getStatusText(link.status)}\n\n`
  })

  return message.trim()
}

/**
 * Gets appropriate icon for workflow status
 */
function getStatusIcon(status: E2EWorkflowLink['status']): string {
  switch (status) {
    case 'passed':
      return '✅'
    case 'failed':
      return '❌'
    default:
      return '❔'
  }
}

/**
 * Gets status text for display
 */
function getStatusText(status: E2EWorkflowLink['status']): string {
  switch (status) {
    case 'passed':
      return '*Passed*'
    case 'failed':
      return '*Failed*'
    default:
      return '*Unknown*'
  }
}
