import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'
import {
  analyzeBreakingChanges,
  formatBreakingChangesForSlack
} from './breaking-changes.js'
import {
  analyzeConfigChanges,
  formatConfigChangesForSlack
} from './config-analysis.js'
import { analyzeE2ETests, formatE2ETestsForSlack } from './e2e-analysis.js'

export interface ReleaseNotification {
  version: string
  releaseUrl?: string
  releaseNotes?: string
  customMessage?: string
  repositoryName?: string
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

  // Analyze release notes for breaking changes, config changes, and e2e tests
  const breakingAnalysis = analyzeBreakingChanges(notification.releaseNotes)
  const configAnalysis = analyzeConfigChanges(notification.releaseNotes)
  const e2eAnalysis = analyzeE2ETests(notification.releaseNotes)

  // Choose appropriate emoji and type based on changes (priority: breaking > config > e2e > normal)
  let releaseEmoji = '🚀'
  let releaseType = '*New Release*'

  if (breakingAnalysis.hasBreakingChanges) {
    releaseEmoji = '⚠️🚀'
    releaseType = '*BREAKING RELEASE*'
  } else if (configAnalysis.hasConfigChanges) {
    releaseEmoji = '⚙️🚀'
    releaseType = '*CONFIG UPDATE*'
  } else if (e2eAnalysis.hasE2ETests) {
    releaseEmoji = '🧪🚀'
    releaseType = '*E2E WORKFLOW RELEASE*'
  }

  // Build the main message content (title is separate)
  let message = ''

  if (notification.customMessage) {
    message += `${notification.customMessage}\n`
  }

  // Add breaking changes section if found
  const breakingChangesText = formatBreakingChangesForSlack(breakingAnalysis)
  if (breakingChangesText) {
    if (message) message += '\n' // Add spacing if there's content above
    message += breakingChangesText
  }

  // Add config changes section if found
  const configChangesText = formatConfigChangesForSlack(configAnalysis)
  if (configChangesText) {
    if (message) message += '\n' // Add spacing if there's content above
    message += configChangesText
  }

  // Add e2e test section if found
  const e2eTestsText = formatE2ETestsForSlack(e2eAnalysis)
  if (e2eTestsText) {
    if (message) message += '\n' // Add spacing if there's content above
    message += e2eTestsText
  }

  // If no custom message or detected changes, add a simple message
  if (
    !message &&
    !notification.customMessage &&
    !breakingChangesText &&
    !configChangesText &&
    !e2eTestsText
  ) {
    message = '🎉 New release is now available!'
  }

  if (notification.releaseUrl) {
    if (message) message += '\n\n' // Add spacing if there's content above
    message += `🔗 <${notification.releaseUrl}|View Release>`
  }

  if (message) message += '\n\n' // Add spacing if there's content above
  message += `_Released at ${new Date().toISOString()}_`

  // Create message with priority color coding
  let messageColor = '#36a64f' // Green for normal release
  if (breakingAnalysis.hasBreakingChanges) {
    messageColor = '#ff9900' // Orange for breaking changes
  } else if (configAnalysis.hasConfigChanges) {
    messageColor = '#ffcc00' // Yellow for config changes
  } else if (e2eAnalysis.hasE2ETests) {
    messageColor = '#00bcd4' // Cyan for e2e tested releases
  }

  // Create the text with repository name first for fallback (this becomes the title)
  let messageText = `${releaseEmoji} ${releaseType}: `
  if (notification.repositoryName) {
    messageText += `\`${notification.repositoryName}\` ${notification.version}`
  } else {
    messageText += notification.version
  }

  try {
    const result = await slack.chat.postMessage({
      channel: formattedChannel,
      text: messageText,
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
      if (configAnalysis.hasConfigChanges) {
        core.info(`Configuration changes highlighted in notification`)
      }
      if (e2eAnalysis.hasE2ETests) {
        core.info(`E2E workflow links highlighted in notification`)
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
