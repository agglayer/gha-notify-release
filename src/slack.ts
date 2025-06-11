import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import {
  analyzeBreakingChanges,
  formatBreakingChangesForSlack
} from './breaking-changes.js'

export interface ReleaseNotification {
  version: string
  releaseUrl?: string
  releaseNotes?: string
  customMessage?: string
}

/**
 * Sends a release notification to Slack using the Web API
 *
 * @param token - Slack bot token
 * @param channel - Slack channel to post to
 * @param notification - Release notification details
 */
export async function sendReleaseNotification(
  token: string,
  channel: string,
  notification: ReleaseNotification
): Promise<void> {
  const slack = new WebClient(token)

  // Format the channel name (add # if not present and not a channel ID)
  const formattedChannel =
    channel.startsWith('C') || channel.startsWith('#') ? channel : `#${channel}`

  // Analyze release notes for breaking changes
  const breakingAnalysis = analyzeBreakingChanges(notification.releaseNotes)

  // Choose appropriate emoji based on breaking changes
  const releaseEmoji = breakingAnalysis.hasBreakingChanges ? '⚠️🚀' : '🚀'
  const releaseType = breakingAnalysis.hasBreakingChanges
    ? '*BREAKING RELEASE*'
    : '*New Release*'

  // Build the main message
  let message = `${releaseEmoji} ${releaseType}: ${notification.version}`

  if (notification.customMessage) {
    message += `\n\n${notification.customMessage}`
  }

  // Add breaking changes section if found
  const breakingChangesText = formatBreakingChangesForSlack(breakingAnalysis)
  if (breakingChangesText) {
    message += breakingChangesText
  }

  if (notification.releaseUrl) {
    message += `\n\n🔗 <${notification.releaseUrl}|View Release>`
  }

  message += `\n\n_Released at ${new Date().toISOString()}_`

  // Create message with priority color coding
  const messageColor = breakingAnalysis.hasBreakingChanges
    ? '#ff9900'
    : '#36a64f' // Orange for breaking, green for normal

  try {
    const result = await slack.chat.postMessage({
      channel: formattedChannel,
      text: `${releaseType}: ${notification.version}`,
      attachments: [
        {
          color: messageColor,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message
              }
            }
          ]
        }
      ]
    })

    if (result.ok) {
      core.info(`Message sent to ${formattedChannel}`)
      if (breakingAnalysis.hasBreakingChanges) {
        core.info(`Breaking changes highlighted in notification`)
      }
      core.debug(`Slack response: ${JSON.stringify(result)}`)
    } else {
      throw new Error(`Slack API error: ${result.error}`)
    }
  } catch (error) {
    core.error(`Failed to send Slack notification: ${error}`)
    throw error
  }
}
