import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

export interface ReleaseEntry {
  version: string
  releaseDate: string
  changeType: 'normal' | 'breaking' | 'config' | 'e2e'
  hasBreaking: boolean
  hasConfig: boolean
  hasE2E: boolean
  releaseUrl?: string
}

interface ChannelCanvasMetadata {
  canvasId: string
  channelId: string
  channelName: string
  lastUpdated: string
  releaseCount: number
}

/**
 * Updates the releases list canvas for a channel
 */
export async function updateReleasesListCanvas(
  client: WebClient,
  channel: string,
  newRelease: ReleaseEntry
): Promise<boolean> {
  try {
    core.info(`📋 Updating releases list canvas for channel ${channel}`)

    // Get channel ID (handle both channel names and IDs)
    const channelId = await getChannelId(client, channel)
    if (!channelId) {
      core.error(`Could not find channel ID for ${channel}`)
      return false
    }

    // Load existing metadata or create new
    const metadata = await loadCanvasMetadata(channelId)
    core.info(
      `📋 Loaded metadata for channel ${channelId}: ${metadata ? `Found existing canvas ${metadata.canvasId}` : 'No existing canvas found'}`
    )

    // Load existing releases or create new list
    const releases = await loadReleases(channelId)

    // Add the new release to the beginning of the list
    releases.unshift(newRelease)

    // Keep only the last 50 releases
    if (releases.length > 50) {
      releases.splice(50)
    }

    // Get channel info for display
    const channelInfo = await getChannelInfo(client, channelId)
    const channelName = channelInfo?.name || channelId

    // Create or update the canvas
    const canvasId = await createOrUpdateCanvas(
      client,
      channelId,
      channelName,
      releases,
      metadata?.canvasId
    )

    // Save updated metadata and releases
    await saveCanvasMetadata(channelId, {
      canvasId,
      channelId,
      channelName,
      lastUpdated: new Date().toISOString(),
      releaseCount: releases.length
    })

    await saveReleases(channelId, releases)

    core.info(
      `✅ Successfully updated releases list canvas (${releases.length} releases)`
    )
    return true
  } catch (error: any) {
    const errorMessage = error?.message || error

    if (errorMessage.includes('not_in_channel')) {
      core.warning(
        `⚠️ Canvas update failed: Bot is not in channel ${channel}. Add the bot to the channel with: /invite @YourBotName`
      )
    } else if (
      errorMessage.includes('missing_scope') ||
      errorMessage.includes('canvases:write')
    ) {
      core.warning(
        `⚠️ Canvas update failed: Bot missing 'canvases:write' permission. Add this scope in your Slack app OAuth settings.`
      )
    } else if (errorMessage.includes('channel_canvas_already_exists')) {
      core.warning(
        `⚠️ Canvas update failed: Channel canvas already exists. Please check the channel's Canvas tab.`
      )
    } else {
      core.error(`❌ Failed to update releases list canvas: ${errorMessage}`)
    }

    return false
  }
}

/**
 * Creates a new channel canvas or updates existing one
 */
async function createOrUpdateCanvas(
  client: WebClient,
  channelId: string,
  channelName: string,
  releases: ReleaseEntry[],
  existingCanvasId?: string
): Promise<string> {
  const markdownContent = generateCanvasMarkdown(channelName, releases)

  if (existingCanvasId) {
    // Update existing canvas
    core.info(`📝 Updating existing canvas ${existingCanvasId}`)

    try {
      await client.canvases.edit({
        canvas_id: existingCanvasId,
        changes: [
          {
            operation: 'replace',
            document_content: {
              type: 'markdown',
              markdown: markdownContent
            }
          }
        ]
      })

      core.info(`✅ Successfully updated existing canvas ${existingCanvasId}`)
      return existingCanvasId
    } catch (error: any) {
      core.error(
        `❌ Failed to update existing canvas ${existingCanvasId}: ${error?.message || error}`
      )
      // Don't fall back to creating a new canvas - throw the error so it can be handled upstream
      throw error
    }
  } else {
    // Try to create a new channel canvas
    core.info(`🎨 Creating new channel canvas for ${channelId}`)

    try {
      const result = await client.conversations.canvases.create({
        channel_id: channelId,
        document_content: {
          type: 'markdown',
          markdown: markdownContent
        }
      })

      if (!result.ok || !result.canvas_id) {
        throw new Error(`Canvas creation failed: ${result.error}`)
      }

      core.info(`✅ Created new canvas ${result.canvas_id}`)
      return result.canvas_id
    } catch (error: any) {
      if (error.data?.error === 'not_in_channel') {
        throw new Error(
          `Bot is not in channel ${channelId}. Please add the bot to the channel using: /invite @YourBotName`
        )
      } else if (error.data?.error === 'missing_scope') {
        throw new Error(
          `Bot missing required permission 'canvases:write'. Please add this scope in your Slack app settings.`
        )
      } else if (error.data?.error === 'channel_canvas_already_exists') {
        // Canvas already exists but we don't have its ID in metadata
        // This can happen if metadata was lost or this is first run after manual canvas creation
        core.warning(
          '📋 Channel canvas already exists but canvas ID not found in metadata. The existing canvas will need to be updated manually or deleted to allow automatic canvas management.'
        )
        throw new Error(
          'Channel canvas already exists. Please either: 1) Delete the existing canvas in the channel to allow automatic creation, or 2) Update the canvas manually. Future releases will attempt to find and update the existing canvas.'
        )
      }
      throw error
    }
  }
}

/**
 * Generates beautiful markdown content for the canvas
 */
function generateCanvasMarkdown(
  channelName: string,
  releases: ReleaseEntry[]
): string {
  const now = new Date().toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })

  let markdown = `# 📦 Releases

*Last updated: ${now}*

---

## 🚀 Recent Releases

`

  if (releases.length === 0) {
    markdown += `
*No releases tracked yet. This list will be automatically updated when releases are published.*

🎯 **What you'll see here:**
- 🚀 **Normal releases** - Regular updates and improvements
- ⚠️🚀 **Breaking changes** - Releases with breaking changes
- ⚙️🚀 **Configuration updates** - Releases affecting configuration files
- 🧪🚀 **E2E Workflows** - Releases with end-to-end workflow links

📝 **Note:** This list automatically tracks the last 50 releases published to this channel.
`
  } else {
    releases.forEach((release, index) => {
      const isRecent = index < 5
      const emoji = getChangeTypeEmoji(release.changeType)
      const badges = generateBadges(release)
      const releaseLink = release.releaseUrl
        ? `[${release.version}](${release.releaseUrl})`
        : release.version

      if (isRecent) {
        markdown += `
### ${emoji} ${releaseLink}
**${release.releaseDate}**${badges ? ` ${badges}` : ''}
`
      } else {
        markdown += `- ${emoji} **${releaseLink}** • ${release.releaseDate}${badges ? ` ${badges}` : ''}\n`
      }
    })

    if (releases.length > 5) {
      markdown += `\n---\n\n### 📋 All Releases (${releases.length} total)\n\n`
      releases.slice(5).forEach((release) => {
        const emoji = getChangeTypeEmoji(release.changeType)
        const badges = generateBadges(release)
        const releaseLink = release.releaseUrl
          ? `[${release.version}](${release.releaseUrl})`
          : release.version

        markdown += `- ${emoji} **${releaseLink}** • ${release.releaseDate}${badges ? ` ${badges}` : ''}\n`
      })
    }

    markdown += `

---

## 📊 Release Statistics

- **Total releases tracked:** ${releases.length}
- **Breaking changes:** ${releases.filter((r) => r.hasBreaking).length}
- **Configuration updates:** ${releases.filter((r) => r.hasConfig).length}
- **E2E workflows:** ${releases.filter((r) => r.hasE2E).length}
- **Normal releases:** ${releases.filter((r) => r.changeType === 'normal').length}

## 📖 Legend

- 🚀 **Normal Release** - Regular updates and improvements
- ⚠️🚀 **Breaking Changes** - May require code changes
- ⚙️🚀 **Config Updates** - Configuration files may need updates
- 🧪🚀 **E2E Workflows** - End-to-end workflow links detected
- 🆕 **New** - Latest release
- ⚠️ **Breaking** - Contains breaking changes
- ⚙️ **Config** - Contains configuration changes
- 🧪 **E2E Workflows** - End-to-end workflow links

---

*This canvas is automatically maintained by the release notification system.*
`
  }

  return markdown
}

/**
 * Gets the appropriate emoji for the change type
 */
function getChangeTypeEmoji(changeType: string): string {
  switch (changeType) {
    case 'breaking':
      return '⚠️🚀'
    case 'config':
      return '⚙️🚀'
    case 'e2e':
      return '🧪🚀'
    default:
      return '🚀'
  }
}

/**
 * Generates badges for a release
 */
function generateBadges(release: ReleaseEntry): string {
  const badges: string[] = []

  if (release.hasBreaking) {
    badges.push('⚠️ *Breaking*')
  }

  if (release.hasConfig) {
    badges.push('⚙️ *Config*')
  }

  if (release.hasE2E) {
    badges.push('🧪 *E2E Workflows*')
  }

  return badges.length > 0 ? `• ${badges.join(' • ')}` : ''
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

/**
 * Gets channel information
 */
async function getChannelInfo(
  client: WebClient,
  channelId: string
): Promise<{ name: string } | null> {
  try {
    const result = await client.conversations.info({ channel: channelId })
    if (result.ok && result.channel) {
      return { name: (result.channel as any).name || channelId }
    }
  } catch (error: any) {
    if (error.data?.error === 'missing_scope') {
      core.info(
        `Note: Bot needs 'channels:read' permission to get channel name. Using channel ID as fallback.`
      )
    } else {
      core.warning(`Could not get channel info for ${channelId}: ${error}`)
    }
  }
  return { name: channelId } // Fallback to channel ID
}

/**
 * Loads canvas metadata from file
 */
async function loadCanvasMetadata(
  channelId: string
): Promise<ChannelCanvasMetadata | null> {
  const metadataPath = getMetadataPath(channelId)

  if (fs.existsSync(metadataPath)) {
    try {
      const content = fs.readFileSync(metadataPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      core.warning(`Failed to load canvas metadata: ${error}`)
    }
  }

  return null
}

/**
 * Saves canvas metadata to file
 */
async function saveCanvasMetadata(
  channelId: string,
  metadata: ChannelCanvasMetadata
): Promise<void> {
  const metadataPath = getMetadataPath(channelId)
  const metadataDir = path.dirname(metadataPath)

  // Ensure directory exists
  if (!fs.existsSync(metadataDir)) {
    fs.mkdirSync(metadataDir, { recursive: true })
  }

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
}

/**
 * Loads releases from file
 */
async function loadReleases(channelId: string): Promise<ReleaseEntry[]> {
  const releasesPath = getReleasesPath(channelId)

  if (fs.existsSync(releasesPath)) {
    try {
      const content = fs.readFileSync(releasesPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      core.warning(`Failed to load releases: ${error}`)
    }
  }

  return []
}

/**
 * Saves releases to file
 */
async function saveReleases(
  channelId: string,
  releases: ReleaseEntry[]
): Promise<void> {
  const releasesPath = getReleasesPath(channelId)
  const releasesDir = path.dirname(releasesPath)

  // Ensure directory exists
  if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir, { recursive: true })
  }

  fs.writeFileSync(releasesPath, JSON.stringify(releases, null, 2))
}

/**
 * Gets the file path for canvas metadata
 */
function getMetadataPath(channelId: string): string {
  return path.join('.github', 'releases-canvases', `${channelId}-metadata.json`)
}

/**
 * Gets the file path for releases data
 */
function getReleasesPath(channelId: string): string {
  return path.join('.github', 'releases-canvases', `${channelId}-releases.json`)
}
