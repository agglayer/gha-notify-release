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

    // Try multiple discovery attempts with increasing aggression
    let existingCanvasId: string | undefined

    core.info(
      `🔍 Starting aggressive canvas discovery for channel ${channelId}`
    )

    // Attempt 1: Standard discovery
    core.info(`🔍 Discovery Attempt 1: Standard discovery`)
    existingCanvasId = await discoverChannelCanvas(client, channelId)

    if (!existingCanvasId) {
      core.info(
        `🔍 Discovery Attempt 2: Retry with delay (canvas creation might need time to propagate)`
      )

      // Attempt 2: Wait and try again (canvas creation might need time to propagate)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      existingCanvasId = await discoverChannelCanvas(client, channelId)
    }

    if (!existingCanvasId) {
      core.info(
        `🔍 Discovery Attempt 3: Direct files.list search (bypassing discovery function)`
      )

      // Attempt 3: Try to find canvas using files.list directly
      try {
        const filesResult = await client.files.list({
          channel: channelId,
          types: 'canvas',
          count: 50
        })

        core.info(
          `📋 Direct files.list: ok=${filesResult.ok}, files_count=${filesResult.files?.length || 0}`
        )

        if (
          filesResult.ok &&
          filesResult.files &&
          filesResult.files.length > 0
        ) {
          core.info(
            `📋 Found ${filesResult.files.length} canvas files via direct files.list`
          )

          // Log all files and take the most recent
          filesResult.files.forEach((file, index) => {
            core.info(
              `📋 Direct search - Canvas ${index + 1}: id=${file.id}, name="${file.name}", title="${file.title}"`
            )
          })

          // Take the most recent canvas file
          const latestCanvas = filesResult.files[0]
          if (latestCanvas.id) {
            core.info(
              `✅ Using latest canvas from direct search: ${latestCanvas.id}`
            )
            existingCanvasId = latestCanvas.id
          }
        }
      } catch (filesError) {
        core.warning(`❌ Direct files.list search failed: ${filesError}`)
      }
    }

    if (!existingCanvasId) {
      core.info(
        `🔍 Discovery Attempt 4: Last resort - check if ANY canvas files exist anywhere`
      )

      // Attempt 4: Check all canvas files without channel filter
      try {
        const allFilesResult = await client.files.list({
          types: 'canvas',
          count: 100
        })

        core.info(
          `📋 All canvas files: ok=${allFilesResult.ok}, files_count=${allFilesResult.files?.length || 0}`
        )

        if (
          allFilesResult.ok &&
          allFilesResult.files &&
          allFilesResult.files.length > 0
        ) {
          core.info(
            `📋 Found ${allFilesResult.files.length} total canvas files in workspace`
          )

          // Look for any canvas that might be related to this channel
          for (const file of allFilesResult.files) {
            core.info(
              `📋 Workspace canvas: id=${file.id}, name="${file.name}", title="${file.title}", channels=${JSON.stringify(file.channels)}`
            )

            // Check if this canvas mentions our channel
            if (file.channels && file.channels.includes(channelId)) {
              core.info(
                `✅ Found canvas associated with our channel: ${file.id}`
              )
              existingCanvasId = file.id
              break
            }
          }
        }
      } catch (allFilesError) {
        core.warning(`❌ All files search failed: ${allFilesError}`)
      }
    }

    if (existingCanvasId) {
      core.info(
        `✅ DISCOVERY SUCCESS: Found existing canvas ${existingCanvasId} for channel ${channelId}`
      )
    } else {
      core.info(
        `❌ DISCOVERY FAILED: No existing canvas found for channel ${channelId} after 4 attempts`
      )
    }

    // Load existing releases from canvas content or create new list
    const releases =
      existingCanvasId && existingCanvasId !== 'CANVAS_EXISTS_BUT_ID_UNKNOWN'
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
    core.info(`🎨 Starting canvas creation/update process`)
    core.info(
      `📋 Canvas operation: ${existingCanvasId ? 'UPDATE existing' : 'CREATE new'}`
    )
    if (existingCanvasId) {
      core.info(`📋 Target canvas ID: ${existingCanvasId}`)
    }
    core.info(`📋 Total releases to include: ${releases.length}`)

    const canvasId = await createOrUpdateCanvas(
      client,
      channelId,
      channelName,
      releases,
      existingCanvasId
    )

    core.info(`✅ Canvas operation completed successfully`)
    core.info(`📋 Final canvas ID: ${canvasId}`)
    core.info(
      `📋 Operation type: ${canvasId === existingCanvasId ? 'UPDATED existing canvas' : 'CREATED new canvas'}`
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
    } else if (
      errorMessage.includes('Canvas exists but cannot be discovered')
    ) {
      core.warning(
        `⚠️ Canvas update skipped: Canvas exists but discovery failed. Canvas content may be out of date.`
      )
      return true // Don't fail the action, just warn
    } else {
      core.error(`❌ Failed to update releases list canvas: ${errorMessage}`)
    }

    return false
  }
}

/**
 * Discovers existing channel canvas using multiple methods
 */
async function discoverChannelCanvas(
  client: WebClient,
  channelId: string
): Promise<string | undefined> {
  core.info(
    `🔍 Attempting to discover existing canvas for channel ${channelId}`
  )

  // Method 1: Try conversations.info first
  try {
    core.info(
      `🔍 Method 1: Checking conversations.info for channel ${channelId}`
    )
    const result = await client.conversations.info({
      channel: channelId,
      include_num_members: false
    })

    if (result.ok && result.channel) {
      const channel = result.channel as any
      core.info(`📋 Channel info received successfully`)
      core.info(
        `📋 Channel properties: ${JSON.stringify(channel.properties || {}, null, 2)}`
      )
      core.info(
        `📋 Full channel object keys: ${Object.keys(channel).join(', ')}`
      )

      // Check multiple possible canvas field locations
      const canvasId =
        channel.properties?.canvas?.file_id ||
        channel.canvas?.file_id ||
        channel.properties?.canvas_id ||
        channel.canvas_id ||
        channel.properties?.canvas?.id ||
        channel.canvas?.id

      if (canvasId) {
        core.info(
          `✅ Found existing canvas via conversations.info: ${canvasId}`
        )
        return canvasId
      } else {
        core.info(`📋 No canvas found in channel properties`)
        core.info(
          `📋 Checked fields: properties.canvas.file_id, canvas.file_id, properties.canvas_id, canvas_id, properties.canvas.id, canvas.id`
        )
      }
    } else {
      core.warning(`❌ conversations.info failed: ${result.error}`)
    }
  } catch (error: any) {
    if (error.data?.error === 'missing_scope') {
      core.info(
        'Note: Bot needs channels:read permission to discover existing canvases automatically'
      )
    } else {
      core.warning(
        `Could not discover canvas via conversations.info for channel ${channelId}: ${error}`
      )
    }
  }

  // Method 2: Try files.list to find canvas files in the channel
  try {
    core.info(
      `🔍 Method 2: Checking files.list for canvas files in channel ${channelId}`
    )

    const filesResult = await client.files.list({
      channel: channelId,
      types: 'canvas',
      count: 20
    })

    core.info(
      `📋 files.list response: ok=${filesResult.ok}, files_count=${filesResult.files?.length || 0}`
    )

    if (filesResult.ok && filesResult.files && filesResult.files.length > 0) {
      core.info(
        `📋 Found ${filesResult.files.length} canvas files via files.list`
      )

      // Log all canvas files found
      filesResult.files.forEach((file, index) => {
        core.info(
          `📋 Canvas ${index + 1}: id=${file.id}, name="${file.name}", title="${file.title}", created=${file.created}`
        )
      })

      // Look for a canvas that looks like our releases canvas
      for (const file of filesResult.files) {
        core.info(`📋 Checking if canvas ${file.id} is a releases canvas...`)

        // Check if this looks like a releases canvas
        if (
          file.name?.includes('Releases') ||
          file.title?.includes('Releases') ||
          file.name?.includes('📦') ||
          file.title?.includes('📦')
        ) {
          core.info(
            `✅ Found existing releases canvas via files.list: ${file.id} (matched on name/title)`
          )
          return file.id
        }
      }

      // If no releases-specific canvas found, use the most recent one
      const latestCanvas = filesResult.files[0]
      if (latestCanvas.id) {
        core.info(
          `✅ Using latest canvas from files.list: ${latestCanvas.id} (fallback to most recent)`
        )
        return latestCanvas.id
      }
    } else {
      if (!filesResult.ok) {
        core.warning(`❌ files.list failed: ${filesResult.error}`)
      } else {
        core.info(`📋 No canvas files found in channel ${channelId}`)
      }
    }
  } catch (error: any) {
    core.warning(`❌ files.list failed with exception: ${error}`)
  }

  // Method 3: Try canvases.list API if available (but only for discovery, not creation)
  try {
    core.info(
      `🔍 Method 3: Checking canvases.list API for channel ${channelId}`
    )

    const listResult = await (client as any).canvases.list({
      limit: 50
    })

    core.info(
      `📋 canvases.list response: ok=${listResult.ok}, canvases_count=${listResult.canvases?.length || 0}`
    )

    if (listResult.ok && listResult.canvases) {
      core.info(`📋 Found ${listResult.canvases.length} canvases in workspace`)

      // Look for a canvas that might belong to this channel
      for (const canvas of listResult.canvases) {
        core.info(
          `📋 Checking canvas: id=${canvas.id || canvas.canvas_id}, channel_id=${canvas.channel_id}, channel=${canvas.channel}`
        )

        // Check if this canvas is associated with our channel
        if (
          canvas.channel_id === channelId ||
          canvas.channel === channelId ||
          (canvas.properties && canvas.properties.channel_id === channelId)
        ) {
          core.info(
            `✅ Found existing canvas via canvases.list: ${canvas.id || canvas.canvas_id}`
          )
          return canvas.id || canvas.canvas_id
        }
      }
      core.info(`📋 No canvases found associated with channel ${channelId}`)
    } else {
      if (!listResult.ok) {
        core.warning(`❌ canvases.list failed: ${listResult.error}`)
      }
    }
  } catch (error: any) {
    core.warning(`❌ canvases.list failed with exception: ${error}`)
  }

  core.info(
    `📋 Canvas discovery completed: No existing canvas found for channel ${channelId}`
  )
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
 */
function parseReleasesFromMarkdown(content: string): ReleaseEntry[] {
  const releases: ReleaseEntry[] = []

  try {
    // Look for repository sections like ### repo/name
    const repoSections = content.split(/### ([^#\n]+)/)

    for (let i = 1; i < repoSections.length; i += 2) {
      const repositoryName = repoSections[i].trim()
      const sectionContent = repoSections[i + 1]

      // Look for release entries like - 🚀 **[v1.2.3](url)** - Jan 15, 2024
      const releaseMatches = sectionContent.matchAll(
        /- ([🚀⚠️⚙️🧪]+) \*\*\[([^\]]+)\]\([^)]+\)\*\* - ([^(]+)(?:\([^)]*\))?/g
      )

      for (const match of releaseMatches) {
        const emoji = match[1]
        const version = match[2]
        const releaseDate = match[3].trim()

        // Determine change type from emoji
        let changeType: 'normal' | 'breaking' | 'config' | 'e2e' = 'normal'
        if (emoji.includes('⚠️')) changeType = 'breaking'
        else if (emoji.includes('⚙️')) changeType = 'config'
        else if (emoji.includes('🧪')) changeType = 'e2e'

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
  } catch (error) {
    core.warning(`Error parsing releases from canvas content: ${error}`)
  }

  return releases
}

/**
 * Debug channel information for troubleshooting canvas creation issues
 */
async function debugChannelInfo(
  client: WebClient,
  channelId: string
): Promise<void> {
  try {
    const result = await client.conversations.info({
      channel: channelId,
      include_num_members: true
    })

    if (result.ok && result.channel) {
      const channel = result.channel as any

      core.info(`📋 Channel Debug Info:`)
      core.info(`  - ID: ${channelId}`)
      core.info(`  - Name: ${channel.name || 'N/A'}`)
      core.info(
        `  - Type: ${channel.is_channel ? 'public_channel' : channel.is_group ? 'private_channel' : channel.is_im ? 'direct_message' : channel.is_mpim ? 'group_message' : 'unknown'}`
      )
      core.info(`  - Is Archived: ${channel.is_archived || false}`)
      core.info(`  - Is Member: ${channel.is_member || false}`)
      core.info(
        `  - Existing Canvas: ${channel.properties?.canvas?.file_id || 'None'}`
      )

      // Warn about potentially problematic channel types
      if (channel.is_im || channel.is_mpim) {
        core.warning(
          `⚠️ Channel ${channelId} is a direct/group message. Canvas creation might not be supported for this channel type.`
        )
      }

      if (channel.is_archived) {
        core.warning(
          `⚠️ Channel ${channelId} is archived. Canvas creation might fail on archived channels.`
        )
      }

      if (!channel.is_member) {
        core.warning(
          `⚠️ Bot is not a member of channel ${channelId}. This might prevent canvas creation.`
        )
      }
    } else {
      core.warning(`Could not get channel info for debugging: ${result.error}`)
    }
  } catch (error) {
    core.warning(`Failed to debug channel info: ${error}`)
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

  core.info(`🎨 createOrUpdateCanvas called with:`)
  core.info(`📋 channelId: ${channelId}`)
  core.info(`📋 channelName: ${channelName}`)
  core.info(`📋 existingCanvasId: ${existingCanvasId || 'undefined'}`)
  core.info(`📋 releases count: ${releases.length}`)
  core.info(`📋 markdown length: ${markdownContent.length} characters`)

  if (existingCanvasId) {
    // Update existing canvas
    core.info(`📝 UPDATING existing canvas ${existingCanvasId}`)

    try {
      core.info(`📋 Calling canvases.edit API...`)
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
      core.error(
        `❌ Update error details: ${JSON.stringify(error.data || {}, null, 2)}`
      )
      throw error
    }
  } else {
    // Try to create a new channel canvas
    core.info(`🎨 CREATING new channel canvas for ${channelId}`)
    core.info(`📋 No existing canvas ID provided, proceeding with creation`)

    // Debug channel information
    await debugChannelInfo(client, channelId)

    try {
      // Log markdown content size for debugging
      const contentLength = markdownContent.length
      core.info(`📊 Canvas content size: ${contentLength} characters`)

      core.info(`📋 Calling conversations.canvases.create API...`)
      const result = await client.conversations.canvases.create({
        channel_id: channelId,
        document_content: {
          type: 'markdown',
          markdown: markdownContent
        }
      })

      core.info(
        `📋 Canvas creation API response: ok=${result.ok}, canvas_id=${result.canvas_id}, error=${result.error}`
      )

      if (!result.ok || !result.canvas_id) {
        throw new Error(`Canvas creation failed: ${result.error}`)
      }

      core.info(`✅ Created new canvas ${result.canvas_id}`)
      return result.canvas_id
    } catch (error: any) {
      const errorCode = error.data?.error || error.message
      core.error(`❌ Canvas creation failed with error code: ${errorCode}`)
      core.error(
        `❌ Creation error details: ${JSON.stringify(error.data || {}, null, 2)}`
      )

      if (errorCode === 'not_in_channel') {
        throw new Error(
          `Bot is not in channel ${channelId}. Please add the bot to the channel using: /invite @YourBotName`
        )
      } else if (errorCode === 'missing_scope') {
        throw new Error(
          `Bot missing required permission 'canvases:write'. Please add this scope in your Slack app settings.`
        )
      } else if (errorCode === 'channel_canvas_already_exists') {
        // This should not happen with our improved discovery, but handle gracefully
        core.warning(
          `⚠️ Canvas already exists but wasn't discovered. Attempting emergency discovery...`
        )

        try {
          const filesResult = await client.files.list({
            channel: channelId,
            types: 'canvas',
            count: 10
          })

          core.info(
            `📋 Emergency search: ok=${filesResult.ok}, files_count=${filesResult.files?.length || 0}`
          )

          if (
            filesResult.ok &&
            filesResult.files &&
            filesResult.files.length > 0
          ) {
            core.info(
              `📋 Found ${filesResult.files.length} canvas files in emergency search`
            )

            for (const file of filesResult.files) {
              core.info(`📋 Emergency - Canvas file: ${file.id} - ${file.name}`)

              // Try to update this canvas
              try {
                await client.canvases.edit({
                  canvas_id: file.id!,
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

                core.info(
                  `✅ Successfully updated canvas via emergency search: ${file.id}`
                )
                return file.id!
              } catch (updateError: any) {
                core.warning(
                  `❌ Could not update canvas ${file.id}: ${updateError}`
                )
                continue
              }
            }
          }
        } catch (filesError: any) {
          core.warning(`❌ Emergency canvas search failed: ${filesError}`)
        }

        throw new Error(
          `Canvas already exists but could not be discovered or updated. Please delete any existing canvases in channel ${channelId} and try again.`
        )
      } else if (errorCode === 'canvas_creation_failed') {
        throw new Error(
          `Canvas creation failed. Possible causes: 1) Canvases disabled in workspace, 2) Free tier limitations, 3) Channel type doesn't support canvases, 4) Workspace admin restrictions. Channel ID: ${channelId}`
        )
      } else if (errorCode === 'canvas_disabled_user_team') {
        throw new Error(
          `Canvases are disabled in your Slack workspace. Please contact your workspace admin to enable Canvas features.`
        )
      } else if (errorCode === 'team_tier_cannot_create_channel_canvases') {
        throw new Error(
          `Your Slack workspace tier doesn't support channel canvases. Upgrade to a paid plan or contact your workspace admin.`
        )
      } else if (errorCode === 'free_team_canvas_tab_already_exists') {
        throw new Error(
          `Free tier workspaces are limited to one canvas per channel. A canvas tab already exists in channel ${channelId}.`
        )
      }

      // Log the full error for debugging
      core.error(`Full error details: ${JSON.stringify(error, null, 2)}`)
      core.error(`Error data: ${JSON.stringify(error.data, null, 2)}`)
      core.error(`Error message: ${error.message}`)

      throw new Error(
        `Canvas creation failed with error: ${errorCode}. Full details logged above.`
      )
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
    minute: '2-digit'
  })

  let markdown = `# 📦 Releases

*Last updated: ${now}*

## 📖 Legend

**Release Types:**
- 🚀 **Normal Release** - Regular updates and improvements
- ⚠️🚀 **Breaking Release** - Contains breaking changes that may require code updates
- ⚙️🚀 **Config Update** - Contains configuration file changes
- 🧪🚀 **E2E Release** - Contains end-to-end workflow testing links

**Additional Badges:**
- (Breaking) - Contains breaking changes
- (Config) - Affects configuration files  
- (E2E) - Includes E2E workflow links

## 🚀 Recent Releases

`

  if (releases.length === 0) {
    markdown += `*No releases tracked yet. This list will be automatically updated when releases are published.*

**What you'll see here:**
- 🚀 Normal releases - Regular updates and improvements  
- ⚠️🚀 Breaking changes - Releases with breaking changes
- ⚙️🚀 Configuration updates - Releases affecting configuration files
- 🧪🚀 E2E Workflows - Releases with end-to-end workflow links

*Note: This list automatically tracks the last 50 releases published to this channel.*
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
    for (const [repoName, repoReleases] of releasesByRepo.entries()) {
      markdown += `\n### ${repoName}\n\n`

      repoReleases.forEach((release) => {
        const emoji = getChangeTypeEmoji(release.changeType)
        const releaseLink = release.releaseUrl
          ? `[${release.version}](${release.releaseUrl})`
          : release.version

        const badgeText = []
        if (release.hasBreaking) badgeText.push('Breaking')
        if (release.hasConfig) badgeText.push('Config')
        if (release.hasE2E) badgeText.push('E2E')
        const badges = badgeText.length > 0 ? ` (${badgeText.join(', ')})` : ''

        markdown += `- ${emoji} **${releaseLink}** - ${release.releaseDate}${badges}\n`
      })

      if (repoReleases.length === 0) {
        markdown += `*No releases yet*\n\n`
      }
    }

    // Add summary
    markdown += `

## 📊 Summary

**Total releases:** ${releases.length}
**Breaking changes:** ${releases.filter((r) => r.hasBreaking).length}
**Config updates:** ${releases.filter((r) => r.hasConfig).length}
**E2E workflows:** ${releases.filter((r) => r.hasE2E).length}

---

*This canvas is automatically maintained by the release notification system.*
*Legend shows emoji meanings for quick reference.*
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
