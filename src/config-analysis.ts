import * as core from '@actions/core'

export interface ConfigAnalysis {
  hasConfigChanges: boolean
  configLinks: ConfigLink[]
  configDiffs: ConfigDiff[]
}

export interface ConfigLink {
  text: string
  url: string
  filename: string
}

export interface ConfigDiff {
  filename: string
  content: string
  type: 'diff' | 'before-after' | 'mention'
}

/**
 * Analyzes release notes for configuration file links and diffs
 *
 * @param releaseNotes - The release notes/body content
 * @returns Analysis of config changes found
 */
export function analyzeConfigChanges(releaseNotes?: string): ConfigAnalysis {
  const analysis: ConfigAnalysis = {
    hasConfigChanges: false,
    configLinks: [],
    configDiffs: []
  }

  if (!releaseNotes) {
    return analysis
  }

  core.debug(
    `Analyzing release notes for config changes: ${releaseNotes.substring(0, 200)}...`
  )

  // Pattern 1: Detect markdown links to config files
  const configLinkPattern =
    /\[([^\]]*(?:config|settings|\.env|\.json|\.yaml|\.yml|\.toml|\.ini|\.conf)[^\]]*)\]\(([^)]+)\)/gi
  let match
  while ((match = configLinkPattern.exec(releaseNotes)) !== null) {
    const linkText = match[1]
    const url = match[2]

    // Extract filename from link text or URL
    const filename =
      extractConfigFilename(linkText) || extractConfigFilename(url) || linkText

    analysis.configLinks.push({
      text: linkText,
      url: url,
      filename: filename
    })
  }

  // Pattern 2: Detect code blocks that likely contain config content
  const codeBlockPattern = /```[\w]*\s*\n([\s\S]*?)\n```/gi
  while ((match = codeBlockPattern.exec(releaseNotes)) !== null) {
    const blockContent = match[1]

    // More liberal config detection - if it contains typical config patterns
    if (containsConfigFileContent(blockContent)) {
      const filename = 'Configuration file'

      analysis.configDiffs.push({
        filename: filename,
        content: blockContent,
        type: 'diff'
      })
    }
  }

  // Pattern 3: Before/After config sections
  const beforeAfterPattern =
    /(?:before|old|previous)\s*:?\s*(```[\s\S]*?```)\s*(?:after|new|updated)\s*:?\s*(```[\s\S]*?```)/gi
  while ((match = beforeAfterPattern.exec(releaseNotes)) !== null) {
    const beforeContent = match[1]
    const afterContent = match[2]

    if (
      containsConfigFileContent(beforeContent) ||
      containsConfigFileContent(afterContent)
    ) {
      analysis.configDiffs.push({
        filename: 'Configuration change',
        content: `${beforeContent}\n\n${afterContent}`,
        type: 'before-after'
      })
    }
  }

  // Pattern 4: Bullet points mentioning config file changes (but not inside code blocks)
  // Remove code blocks first to avoid matching content inside them
  const releaseNotesWithoutCodeBlocks = releaseNotes.replace(
    /```[\s\S]*?```/g,
    ''
  )
  const configMentionPattern =
    /^[\s]*[-*•]\s+.*(?:config|configuration|settings|\.env).*(?:changed?|updated?|modified|added|removed)/gim
  const configMentions =
    releaseNotesWithoutCodeBlocks.match(configMentionPattern)
  if (configMentions) {
    for (const mention of configMentions) {
      analysis.configDiffs.push({
        filename: 'Configuration mention',
        content: mention.trim(),
        type: 'mention'
      })
    }
  }

  analysis.hasConfigChanges =
    analysis.configLinks.length > 0 || analysis.configDiffs.length > 0

  if (analysis.hasConfigChanges) {
    core.info(
      `Config changes detected: ${analysis.configLinks.length} links, ${analysis.configDiffs.length} diffs/mentions`
    )
  } else {
    core.debug('No config changes detected')
  }

  return analysis
}

/**
 * Extracts config filename from text or URL
 */
function extractConfigFilename(text: string): string | null {
  const configFilePattern =
    /([^\/\s]*(?:config|settings|\.env|\.json|\.yaml|\.yml|\.toml|\.ini|\.conf)[^\/\s]*)/i
  const match = text.match(configFilePattern)
  return match ? match[1] : null
}

/**
 * Checks if content appears to be from a config file
 */
function containsConfigFileContent(content: string): boolean {
  // More liberal detection - if it looks like config content at all
  const configPatterns = [
    /\.(json|yaml|yml|toml|ini|conf|env)/i, // File extensions mentioned
    /\{[\s\S]*"[\w-]+"\s*:/m, // JSON-like objects with quoted keys
    /^[\w-]+:\s*[\w\s-]/m, // YAML-like key-value pairs
    /^[A-Z_]+=.*$/m, // Environment variables
    /^\s*\[[\w-]+\]/m, // INI sections
    /"[\w-]+"\s*:\s*/m, // JSON key patterns
    /[\w-]+\s*=\s*[\w-]/m, // Generic key=value
    /:\s*\{/m, // Nested objects
    /host|port|database|api|url|key|secret|config/i // Common config keywords
  ]

  return configPatterns.some((pattern) => pattern.test(content))
}

/**
 * Formats config change information for Slack message
 *
 * @param analysis - Config analysis results
 * @returns Formatted string for Slack message
 */
export function formatConfigChangesForSlack(analysis: ConfigAnalysis): string {
  if (!analysis.hasConfigChanges) {
    return ''
  }

  let configSection = '\n\n⚙️ *CONFIGURATION CHANGES*'

  // Add config file links
  if (analysis.configLinks.length > 0) {
    configSection += '\n\n*Configuration Files:*'
    for (const link of analysis.configLinks) {
      configSection += `\n• <${link.url}|${link.filename}>`
    }
  }

  // Add config diffs/mentions
  if (analysis.configDiffs.length > 0) {
    configSection += '\n\n*Configuration Updates:*'
    for (const diff of analysis.configDiffs) {
      if (diff.type === 'mention') {
        configSection += `\n• ${diff.content}`
      } else {
        configSection += `\n• ${diff.filename} - See release notes for details`
      }
    }
  }

  configSection += '\n\n📋 *Review configuration changes before deploying!*'

  return configSection
}
