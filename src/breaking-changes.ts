import * as core from '@actions/core'

export interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean
  breakingChangeMarkers: string[]
  conventionalCommitBreaks: string[]
  releaseNoteBreaks: string[]
}

/**
 * Analyzes release notes and commit messages for breaking changes
 *
 * @param releaseNotes - The release notes/body content
 * @returns Analysis of breaking changes found
 */
export function analyzeBreakingChanges(
  releaseNotes?: string
): BreakingChangeAnalysis {
  const analysis: BreakingChangeAnalysis = {
    hasBreakingChanges: false,
    breakingChangeMarkers: [],
    conventionalCommitBreaks: [],
    releaseNoteBreaks: []
  }

  if (!releaseNotes) {
    return analysis
  }

  core.debug(
    `Analyzing release notes for breaking changes: ${releaseNotes.substring(0, 200)}...`
  )

  // Pattern 1: Conventional commit breaking change markers (! in commit prefix)
  // Examples: "feat!: add new API", "fix!: remove deprecated method"
  const conventionalBreakingPattern =
    /^[\s-]*([a-zA-Z]+)(!)\s*(\([^)]+\))?\s*:\s*(.+)$/gm
  let match
  while ((match = conventionalBreakingPattern.exec(releaseNotes)) !== null) {
    const commitType = match[1]
    const description = match[4]
    analysis.conventionalCommitBreaks.push(`${commitType}!: ${description}`)
    analysis.breakingChangeMarkers.push(
      `Conventional commit breaking change: ${commitType}!`
    )
  }

  // Pattern 2: Look for dedicated Breaking Changes sections
  // More flexible pattern to handle emojis and different formatting
  const lines = releaseNotes.split('\n')
  let inBreakingSection = false
  let foundBreakingSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check if this line is a Breaking Changes header (with flexible emoji and text matching)
    // Matches: "## ⚠️ Breaking Changes", "### BREAKING CHANGES", "# Breaking Change:", etc.
    if (
      /^#{1,4}\s*[⚠️🚨💥]*\s*BREAKING\s+CHANGES?\s*[⚠️🚨💥]*\s*:?\s*$/i.test(
        line
      )
    ) {
      inBreakingSection = true
      foundBreakingSection = true
      core.debug(`Found breaking changes section: ${line}`)
      continue
    }

    // Check if we've hit another section header (stop processing this section)
    if (inBreakingSection && /^#{1,4}\s/.test(line)) {
      inBreakingSection = false
      continue
    }

    // If we're in a breaking section and this is a bullet point, capture it
    if (
      inBreakingSection &&
      (line.startsWith('-') || line.startsWith('*') || line.startsWith('•'))
    ) {
      const cleanLine = line.replace(/^[-*•]\s*/, '').trim()
      if (cleanLine) {
        // Check if this line contains multiple bullet points concatenated with " • "
        if (cleanLine.includes(' • ')) {
          // Split by the bullet separator and add each item individually
          const splitItems = cleanLine.split(' • ')
          for (const item of splitItems) {
            const cleanItem = item.trim()
            if (cleanItem) {
              analysis.releaseNoteBreaks.push(cleanItem)
              core.debug(`Found breaking change item (split): ${cleanItem}`)
            }
          }
        } else {
          // Single item on this line
          analysis.releaseNoteBreaks.push(cleanLine)
          core.debug(`Found breaking change item: ${cleanLine}`)
        }
      }
    }
  }

  if (foundBreakingSection && analysis.releaseNoteBreaks.length > 0) {
    analysis.breakingChangeMarkers.push('BREAKING CHANGE section found')
  }

  // Pattern 3: Common breaking change keywords in bullet points (more restrictive)
  // Only apply this if we didn't find a dedicated section
  if (!foundBreakingSection) {
    const breakingKeywordPatterns = [
      /^[\s-*•]+(?!#).*\b(removed?|incompatible)\b.*$/gim,
      /^[\s-*•]+(?!#).*\b(major\s+change|api\s+change)\b.*$/gim,
      /^[\s-*•]+(?!#).*\b(no\s+longer\s+supports?)\b.*$/gim
    ]

    for (const pattern of breakingKeywordPatterns) {
      const keywordMatches = releaseNotes.match(pattern)
      if (keywordMatches) {
        for (const keywordMatch of keywordMatches) {
          analysis.releaseNoteBreaks.push(keywordMatch.trim())
          analysis.breakingChangeMarkers.push(
            'Breaking change keyword detected'
          )
        }
      }
    }
  }

  // Pattern 4: Major version patterns (more precise)
  const currentVersionPattern = /(?:version|release|tag)\s+v?(\d+)\.0\.0/gi
  const versionMatches = []
  while ((match = currentVersionPattern.exec(releaseNotes)) !== null) {
    const majorVersion = parseInt(match[1])
    if (majorVersion >= 2) {
      // Only consider v2.0.0 and above as breaking
      versionMatches.push(majorVersion)
    }
  }

  if (versionMatches.length > 0) {
    analysis.breakingChangeMarkers.push('Major version bump detected')
  }

  // Remove duplicates from releaseNoteBreaks
  analysis.releaseNoteBreaks = [...new Set(analysis.releaseNoteBreaks)]

  analysis.hasBreakingChanges =
    analysis.conventionalCommitBreaks.length > 0 ||
    analysis.releaseNoteBreaks.length > 0 ||
    analysis.breakingChangeMarkers.length > 0

  if (analysis.hasBreakingChanges) {
    core.info(
      `Breaking changes detected: ${analysis.breakingChangeMarkers.join(', ')}`
    )
    core.debug(
      `Breaking change items: ${analysis.releaseNoteBreaks.join(', ')}`
    )
  } else {
    core.debug('No breaking changes detected')
  }

  return analysis
}

/**
 * Formats breaking change information for Slack message
 *
 * @param analysis - Breaking change analysis results
 * @returns Formatted string for Slack message
 */
export function formatBreakingChangesForSlack(
  analysis: BreakingChangeAnalysis
): string {
  if (!analysis.hasBreakingChanges) {
    return ''
  }

  let breakingSection = '\n\n⚠️ *BREAKING CHANGES DETECTED*'

  // Add conventional commit breaks
  if (analysis.conventionalCommitBreaks.length > 0) {
    breakingSection += '\n\n*Conventional Commit Breaking Changes:*'
    for (const commit of analysis.conventionalCommitBreaks) {
      breakingSection += `\n• ${commit}`
    }
  }

  // Add release note breaks
  if (analysis.releaseNoteBreaks.length > 0) {
    for (const change of analysis.releaseNoteBreaks) {
      breakingSection += `\n• ${change}`
    }
  }

  return breakingSection
}
