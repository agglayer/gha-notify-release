import { WebClient } from '@slack/web-api'
import * as core from '@actions/core'

export interface ReleaseNotification {
  version: string
  releaseUrl?: string
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

  // Build the message
  let message = `🚀 *New Release: ${notification.version}*`

  if (notification.customMessage) {
    message += `\n\n${notification.customMessage}`
  }

  if (notification.releaseUrl) {
    message += `\n\n🔗 <${notification.releaseUrl}|View Release>`
  }

  message += `\n\n_Released at ${new Date().toISOString()}_`

  try {
    const result = await slack.chat.postMessage({
      channel: formattedChannel,
      text: `New Release: ${notification.version}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    })

    if (result.ok) {
      core.info(`Message sent to ${formattedChannel}`)
      core.debug(`Slack response: ${JSON.stringify(result)}`)
    } else {
      throw new Error(`Slack API error: ${result.error}`)
    }
  } catch (error) {
    core.error(`Failed to send Slack notification: ${error}`)
    throw error
  }
}
