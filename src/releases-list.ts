import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'

export interface ReleaseEntry {
  version: string
  releaseDate: string
  changeType: 'normal' | 'breaking' | 'config' | 'e2e'
  hasBreaking: boolean
  hasConfig: boolean
  hasE2E: boolean
  releaseUrl?: string
  repositoryName?: string
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

    // Discover existing canvas ID using conversations.info
    const existingCanvasId = await discoverChannelCanvas(client, channelId)

    if (existingCanvasId) {
      core.info(
        `📋 Found existing canvas ${existingCanvasId} for channel ${channelId}`
      )
    } else {
      core.info(`📋 No existing canvas found for channel ${channelId}`)
    }

    // Load existing releases from canvas content or create new list
    const releases = existingCanvasId
      ? await loadReleasesFromCanvas(client, existingCanvasId)
      : []

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
      existingCanvasId
    )

    core.info(
      `✅ Successfully updated releases list canvas ${canvasId} (${releases.length} releases)`
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
        `⚠️ Canvas update failed: Channel canvas already exists but couldn't be discovered. Please check the channel's Canvas tab.`
      )
    } else {
      core.error(`❌ Failed to update releases list canvas: ${errorMessage}`)
    }

    return false
  }
}

/**
 * Discovers existing channel canvas using conversations.info
 */
async function discoverChannelCanvas(
  client: WebClient,
  channelId: string
): Promise<string | undefined> {
  try {
    const result = await client.conversations.info({
      channel: channelId,
      include_num_members: false
    })

    if (result.ok && result.channel) {
      // Check if channel has a canvas property
      const channel = result.channel as any
      if (channel.properties?.canvas?.file_id) {
        return channel.properties.canvas.file_id
      }
    }
  } catch (error: any) {
    if (error.data?.error === 'missing_scope') {
      core.info(
        'Note: Bot needs channels:read permission to discover existing canvases automatically'
      )
    } else {
      core.warning(
        `Could not discover canvas for channel ${channelId}: ${error}`
      )
    }
  }

  return undefined
}

/**
 * Loads releases from existing canvas content
 */
async function loadReleasesFromCanvas(
  client: WebClient,
  canvasId: string
): Promise<ReleaseEntry[]> {
  try {
    // Get canvas content using files.info
    const result = await client.files.info({ file: canvasId })

    if (result.ok && result.file) {
      // Try to extract releases from canvas markdown content
      // This is a simplified parser - in a real implementation you might want more robust parsing
      const content = (result.file as any).plain_text || ''
      return parseReleasesFromMarkdown(content)
    }
  } catch (error) {
    core.warning(
      `Could not load existing releases from canvas ${canvasId}: ${error}`
    )
  }

  return []
}

/**
 * Simple parser to extract releases from markdown content
 * This looks for our specific release format in the canvas
 */
function parseReleasesFromMarkdown(content: string): ReleaseEntry[] {
  const releases: ReleaseEntry[] = []

  try {
    // Look for repository sections like #### 📁 `repo/name`
    const repoSections = content.split(/#### 📁 `([^`]+)`/)

    for (let i = 1; i < repoSections.length; i += 2) {
      const repositoryName = repoSections[i]
      const sectionContent = repoSections[i + 1]

      // Look for release entries like **🚀 v1.2.3** • Jan 15, 2024
      const releaseMatches = sectionContent.matchAll(
        /\*\*([^*]+)\*\* • ([^•\n]+)/g
      )

      for (const match of releaseMatches) {
        const versionEmoji = match[1]
        const releaseDate = match[2].trim()

        // Extract version from emoji + version format
        const versionMatch = versionEmoji.match(
          /🚀 (.+)$|⚠️🚀 (.+)$|⚙️🚀 (.+)$|🧪🚀 (.+)$/
        )
        if (versionMatch) {
          const version =
            versionMatch[1] ||
            versionMatch[2] ||
            versionMatch[3] ||
            versionMatch[4]

          // Determine change type from emoji
          let changeType: 'normal' | 'breaking' | 'config' | 'e2e' = 'normal'
          if (versionEmoji.includes('⚠️🚀')) changeType = 'breaking'
          else if (versionEmoji.includes('⚙️🚀')) changeType = 'config'
          else if (versionEmoji.includes('🧪🚀')) changeType = 'e2e'

          releases.push({
            version,
            releaseDate,
            changeType,
            hasBreaking: changeType === 'breaking',
            hasConfig: changeType === 'config',
            hasE2E: changeType === 'e2e',
            repositoryName
          })
        }
      }
    }
  } catch (error) {
    core.warning(`Error parsing releases from canvas content: ${error}`)
  }

  return releases
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
        throw new Error(
          'Channel canvas already exists but could not be discovered. This may be due to missing permissions. Please add channels:read scope or use the canvas ID directly.'
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
    // Group releases by repository
    const releasesByRepo = new Map<string, ReleaseEntry[]>()

    releases.forEach((release) => {
      const repoName = release.repositoryName || 'Unknown Repository'
      if (!releasesByRepo.has(repoName)) {
        releasesByRepo.set(repoName, [])
      }
      releasesByRepo.get(repoName)!.push(release)
    })

    // Display releases grouped by repository
    let totalDisplayed = 0
    for (const [repoName, repoReleases] of releasesByRepo.entries()) {
      markdown += `\n#### 📁 \`${repoName}\`\n\n`

      repoReleases.forEach((release, index) => {
        const isRecent = totalDisplayed < 5
        const emoji = getChangeTypeEmoji(release.changeType)
        const badges = generateBadges(release)
        const releaseLink = release.releaseUrl
          ? `[${release.version}](${release.releaseUrl})`
          : release.version

        if (isRecent) {
          markdown += `**${emoji} ${releaseLink}** • ${release.releaseDate}${badges ? ` ${badges}` : ''}\n\n`
        } else {
          markdown += `- ${emoji} **${releaseLink}** • ${release.releaseDate}${badges ? ` ${badges}` : ''}\n`
        }
        totalDisplayed++
      })

      if (repoReleases.length === 0) {
        markdown += `*No releases yet*\n\n`
      }
    }

    if (releases.length > 5) {
      markdown += `\n---\n\n### 📋 All Releases (${releases.length} total)\n\n`

      // Group all releases by repository for the complete list
      for (const [repoName, repoReleases] of releasesByRepo.entries()) {
        if (repoReleases.length > 0) {
          markdown += `\n**📁 \`${repoName}\`**\n\n`
          repoReleases.forEach((release) => {
            const emoji = getChangeTypeEmoji(release.changeType)
            const badges = generateBadges(release)
            const releaseLink = release.releaseUrl
              ? `[${release.version}](${release.releaseUrl})`
              : release.version

            markdown += `- ${emoji} **${releaseLink}** • ${release.releaseDate}${badges ? ` ${badges}` : ''}\n`
          })
          markdown += `\n`
        }
      }
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
