import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'

export interface RepositoryRelease {
  repositoryName: string
  version: string
  releaseUrl?: string
  customMessage?: string
  breakingAnalysis: any
  configAnalysis: any
  e2eAnalysis: any
}

/**
 * Updates or creates a canvas for the repository's latest release
 *
 * @param client - Slack WebClient instance
 * @param channel - Slack channel to post to
 * @param release - Repository release information with Slack message content
 */
export async function updateRepositoryCanvas(
  client: WebClient,
  channel: string,
  release: RepositoryRelease
): Promise<boolean> {
  try {
    core.info(`📋 Updating repository canvas for ${release.repositoryName}`)

    // Get channel ID (handle both channel names and IDs)
    const channelId = await getChannelId(client, channel)
    if (!channelId) {
      core.error(`Could not find channel ID for ${channel}`)
      return false
    }

    // Look for existing canvas for this repository
    const existingCanvasId = await findRepositoryCanvas(
      client,
      channelId,
      release.repositoryName
    )

    if (existingCanvasId) {
      // Update existing canvas
      core.info(
        `📝 Updating existing canvas for ${release.repositoryName}: ${existingCanvasId}`
      )
      await updateCanvasContent(client, existingCanvasId, release)
    } else {
      // Create new canvas for this repository
      core.info(`🎨 Creating new canvas for ${release.repositoryName}`)
      await createRepositoryCanvas(client, channelId, release)
    }

    core.info(
      `✅ Successfully updated repository canvas for ${release.repositoryName}`
    )
    return true
  } catch (error: any) {
    const errorMessage = error?.message || error
    core.error(`❌ Failed to update repository canvas: ${errorMessage}`)
    return false
  }
}

/**
 * Finds existing canvas for a specific repository
 */
async function findRepositoryCanvas(
  client: WebClient,
  channelId: string,
  repositoryName: string
): Promise<string | undefined> {
  try {
    core.info(
      `🔍 Looking for existing canvas for repository: ${repositoryName}`
    )

    // Search for canvas files in the channel
    const result = await client.files.list({
      channel: channelId,
      types: 'canvas',
      count: 50
    })

    if (result.ok && result.files) {
      core.info(`📋 Found ${result.files.length} canvas files in channel`)

      // Look for canvas with repository name in title/name
      for (const file of result.files) {
        const fileName = file.name || file.title || ''
        core.debug(`📋 Checking canvas: "${fileName}" (ID: ${file.id})`)

        // Match repository name in various formats
        if (
          fileName.includes(repositoryName) ||
          fileName.includes(repositoryName.replace('/', '-')) ||
          fileName.includes(repositoryName.split('/')[1]) // Just repo name without owner
        ) {
          core.info(
            `✅ Found existing canvas for ${repositoryName}: ${file.id}`
          )
          return file.id
        }
      }
    }

    core.info(`📋 No existing canvas found for repository: ${repositoryName}`)
    return undefined
  } catch (error) {
    core.warning(`Error searching for repository canvas: ${error}`)
    return undefined
  }
}

/**
 * Creates a new canvas for a repository
 */
async function createRepositoryCanvas(
  client: WebClient,
  channelId: string,
  release: RepositoryRelease
): Promise<string> {
  try {
    // Generate canvas title and content
    const canvasTitle = `${release.repositoryName} - Latest Release`
    const canvasContent = generateRepositoryCanvasContent(release)

    core.info(`🎨 Creating canvas: "${canvasTitle}"`)
    core.info(`📊 Canvas content length: ${canvasContent.length} characters`)

    const result = await client.conversations.canvases.create({
      channel_id: channelId,
      document_content: {
        type: 'markdown',
        markdown: canvasContent
      }
    })

    if (!result.ok || !result.canvas_id) {
      throw new Error(`Canvas creation failed: ${result.error}`)
    }

    core.info(`✅ Created new canvas: ${result.canvas_id}`)
    return result.canvas_id
  } catch (error: any) {
    const errorCode = error.data?.error || error.message
    core.error(`❌ Canvas creation failed: ${errorCode}`)

    if (errorCode === 'not_in_channel') {
      throw new Error(
        `Bot is not in channel ${channelId}. Please add the bot to the channel using: /invite @YourBotName`
      )
    } else if (errorCode === 'missing_scope') {
      throw new Error(
        `Bot missing required permission 'canvases:write'. Please add this scope in your Slack app settings.`
      )
    }

    throw error
  }
}

/**
 * Updates existing canvas content
 */
async function updateCanvasContent(
  client: WebClient,
  canvasId: string,
  release: RepositoryRelease
): Promise<void> {
  try {
    const canvasContent = generateRepositoryCanvasContent(release)

    core.info(`📝 Updating canvas content (${canvasContent.length} characters)`)

    await client.canvases.edit({
      canvas_id: canvasId,
      changes: [
        {
          operation: 'replace',
          document_content: {
            type: 'markdown',
            markdown: canvasContent
          }
        }
      ]
    })

    core.info(`✅ Successfully updated canvas ${canvasId}`)
  } catch (error: any) {
    core.error(
      `❌ Failed to update canvas ${canvasId}: ${error?.message || error}`
    )
    throw error
  }
}

/**
 * Generates markdown content for repository canvas
 */
function generateRepositoryCanvasContent(release: RepositoryRelease): string {
  const now = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })

  core.debug(`📋 Generating canvas content for ${release.repositoryName}`)
  core.debug(
    `📋 Breaking analysis: ${JSON.stringify(release.breakingAnalysis, null, 2)}`
  )
  core.debug(
    `📋 Config analysis: ${JSON.stringify(release.configAnalysis, null, 2)}`
  )

  let content = `## Latest Release: ${release.version}

*Last updated: ${now}*

---

`

  // Add custom message if provided
  if (release.customMessage) {
    content += `${release.customMessage}\n\n`
  }

  // Add breaking changes section
  if (release.breakingAnalysis.hasBreakingChanges) {
    content += `⚠️ **BREAKING CHANGES DETECTED**\n\n`

    if (release.breakingAnalysis.releaseNoteBreaks.length > 0) {
      core.debug(
        `📋 Processing ${release.breakingAnalysis.releaseNoteBreaks.length} breaking changes`
      )
      for (const breakingChange of release.breakingAnalysis.releaseNoteBreaks) {
        core.debug(`📋 Breaking change content: "${breakingChange}"`)
        // Split by bullet points in case they're concatenated
        const items = splitBulletPoints(breakingChange)
        core.debug(
          `📋 Split into ${items.length} items: ${JSON.stringify(items)}`
        )
        for (const item of items) {
          content += `• ${item}\n`
        }
      }
      content += '\n'
    }

    if (release.breakingAnalysis.conventionalCommitBreaks.length > 0) {
      for (const commitBreak of release.breakingAnalysis
        .conventionalCommitBreaks) {
        const items = splitBulletPoints(commitBreak)
        for (const item of items) {
          content += `• ${item}\n`
        }
      }
      content += '\n'
    }
  }

  // Add configuration changes section
  if (release.configAnalysis.hasConfigChanges) {
    content += `⚙️ **CONFIGURATION CHANGES**\n\n`

    if (release.configAnalysis.configLinks.length > 0) {
      content += `**Configuration Files:**\n`
      for (const link of release.configAnalysis.configLinks) {
        content += `• [${link.filename}](${link.url})\n`
      }
      content += '\n'
    }

    if (release.configAnalysis.configDiffs.length > 0) {
      content += `**Configuration Updates:**\n`
      core.debug(
        `📋 Processing ${release.configAnalysis.configDiffs.length} config diffs`
      )
      for (const diff of release.configAnalysis.configDiffs) {
        core.debug(`📋 Config diff: ${JSON.stringify(diff)}`)
        if (diff.type === 'mention') {
          // Split the content in case it contains multiple bullet points
          const items = splitBulletPoints(diff.content)
          core.debug(
            `📋 Config content split into ${items.length} items: ${JSON.stringify(items)}`
          )
          for (const item of items) {
            content += `• ${item}\n`
          }
        } else {
          content += `• ${diff.filename} - See release notes for details\n`
        }
      }
      content += '\n'
    }
  }

  // Add E2E section
  if (release.e2eAnalysis.hasE2ETests) {
    content += `🧪 **E2E WORKFLOWS DETECTED**\n\n`

    for (const workflowLink of release.e2eAnalysis.e2eWorkflowLinks) {
      const statusIcon =
        workflowLink.status === 'passed'
          ? '✅'
          : workflowLink.status === 'failed'
            ? '❌'
            : '❔'
      content += `${statusIcon} [${workflowLink.workflowName}](${workflowLink.url}) (${workflowLink.repository})\n`
    }
    content += '\n'
  }

  content += `---

${release.releaseUrl ? `🔗 **[View Release on GitHub](${release.releaseUrl})**\n\n` : ''}*This canvas is automatically updated when new releases are published.*

**📝 About this canvas:**
• Contains the latest release information for \`${release.repositoryName}\`
• Automatically updated by the release notification system
• Shows the same content as posted to the Slack channel`

  core.debug(`📋 Generated canvas content length: ${content.length} characters`)
  return content
}

/**
 * Splits content that might contain concatenated bullet points into individual items
 */
function splitBulletPoints(content: string): string[] {
  core.debug(`📋 splitBulletPoints input: "${content}"`)

  // Remove any existing bullet markers at the start
  let cleaned = content.replace(/^[-*•]\s*/, '').trim()
  core.debug(`📋 After removing leading bullets: "${cleaned}"`)

  // If the content contains bullet markers within it, split by them
  if (cleaned.includes('•')) {
    const result = cleaned
      .split('•')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    core.debug(`📋 Split by bullets, result: ${JSON.stringify(result)}`)
    return result
  }

  // If no internal bullets, return as single item
  const result = [cleaned].filter((item) => item.length > 0)
  core.debug(`📋 No internal bullets, result: ${JSON.stringify(result)}`)
  return result
}

/**
 * Gets the channel ID from channel name or returns the ID if already provided
 */
async function getChannelId(
  client: WebClient,
  channel: string
): Promise<string | null> {
  // If it's already a channel ID, return it
  if (channel.startsWith('C')) {
    return channel
  }

  // Remove # if present
  const channelName = channel.replace('#', '')

  try {
    const result = await client.conversations.list({
      types: 'public_channel,private_channel'
    })

    if (result.channels) {
      const foundChannel = result.channels.find((ch) => ch.name === channelName)
      return foundChannel?.id || null
    }
  } catch (error: any) {
    if (error.data?.error === 'missing_scope') {
      core.info(
        `Note: Bot needs 'channels:read' permission to resolve channel names. Please use channel ID directly or add the permission.`
      )
    } else {
      core.warning(`Error finding channel ID for ${channel}: ${error}`)
    }
  }

  return null
}
