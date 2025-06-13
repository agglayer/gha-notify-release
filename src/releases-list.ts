import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'

export interface RepositoryRelease {
  repositoryName: string
  version: string
  releaseUrl?: string
  slackMessageContent: string
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

  // Parse the slack message to extract the formatted sections
  const cleanContent = parseSlackMessageForCanvas(release.slackMessageContent)

  return `# 📦 ${release.repositoryName}
## Latest Release: ${release.version}

*Last updated: ${now}*

---

${cleanContent}

---

${release.releaseUrl ? `🔗 **[View Release on GitHub](${release.releaseUrl})**\n\n` : ''}*This canvas is automatically updated when new releases are published.*

**📝 About this canvas:**
- Contains the latest release information for \`${release.repositoryName}\`
- Automatically updated by the release notification system
- Shows the same content as posted to the Slack channel`
}

/**
 * Parses Slack message content and formats it cleanly for canvas display
 */
function parseSlackMessageForCanvas(slackMessage: string): string {
  // Split the message into lines for processing
  let lines = slackMessage.split('\n')
  let cleanLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip the first line that contains the main release announcement (e.g., "⚠️🚀 BREAKING RELEASE: repo v1.0.0")
    if (i === 0 && line.includes('🚀') && line.includes(':')) {
      continue
    }

    // Skip lines at the end with release links and timestamps
    if (line.includes('🔗 View Release') || line.includes('Released at ')) {
      continue
    }

    // Skip empty lines at the beginning
    if (cleanLines.length === 0 && line.trim() === '') {
      continue
    }

    cleanLines.push(line)
  }

  // Join the lines back together
  let content = cleanLines.join('\n').trim()

  // Now fix the specific formatting issues

  // 1. Fix section headers - remove extra asterisks and ensure proper formatting
  content = content.replace(/\*([A-Z\s]+)\*/g, '**$1**')

  // 2. Handle breaking changes section specifically
  content = content.replace(
    /⚠️ \*BREAKING CHANGES DETECTED\*(.*?)(?=⚙️|\n\n|$)/gs,
    (match, changes) => {
      let formatted = '⚠️ **BREAKING CHANGES DETECTED**\n'

      // Split the changes by bullet points and format each one
      const items = changes.split('•').filter((item: string) => item.trim())
      for (const item of items) {
        const cleanItem = item.trim()
        if (cleanItem) {
          formatted += `• ${cleanItem}\n`
        }
      }

      return formatted
    }
  )

  // 3. Handle configuration changes section specifically
  content = content.replace(
    /⚙️ \*CONFIGURATION CHANGES\*(.*?)(?=🧪|\n\n|$)/gs,
    (match, changes) => {
      let formatted = '⚙️ **CONFIGURATION CHANGES**\n'

      // Look for the "Configuration Updates:" subsection
      if (changes.includes('Configuration Updates:')) {
        formatted += '\n**Configuration Updates:**\n'

        // Extract content after "Configuration Updates:"
        const updatesContent =
          changes.split('Configuration Updates:')[1] || changes

        // Split by bullet points and format
        const items = updatesContent
          .split('•')
          .filter((item: string) => item.trim())
        for (const item of items) {
          const cleanItem = item.trim()
          if (cleanItem) {
            formatted += `• ${cleanItem}\n`
          }
        }
      } else {
        // If no subsection, just format the bullet points
        const items = changes.split('•').filter((item: string) => item.trim())
        for (const item of items) {
          const cleanItem = item.trim()
          if (cleanItem) {
            formatted += `• ${cleanItem}\n`
          }
        }
      }

      return formatted
    }
  )

  // 4. Handle E2E section if present
  content = content.replace(
    /🧪 \*E2E WORKFLOWS DETECTED\*(.*?)(?=\n\n|$)/gs,
    (match, e2eContent) => {
      let formatted = '🧪 **E2E WORKFLOWS DETECTED**\n'

      // Split by bullet points and format
      const items = e2eContent.split('•').filter((item: string) => item.trim())
      for (const item of items) {
        const cleanItem = item.trim()
        if (cleanItem) {
          formatted += `• ${cleanItem}\n`
        }
      }

      return formatted
    }
  )

  // 5. Clean up any remaining formatting issues
  content = content
    // Remove any remaining single asterisks that should be double
    .replace(/\*([^*\n]+)\*/g, '**$1**')
    // Fix any double spaces
    .replace(/  +/g, ' ')
    // Clean up extra newlines but preserve intentional spacing
    .replace(/\n{3,}/g, '\n\n')
    // Trim the result
    .trim()

  return content
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
