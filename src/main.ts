import * as core from '@actions/core'
import { sendReleaseNotification } from './slack.js'
import { analyzeBreakingChanges } from './breaking-changes.js'
import { analyzeConfigChanges } from './config-analysis.js'
import { updateReleasesListCanvas } from './releases-list.js'
import { WebClient } from '@slack/web-api'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get inputs from action configuration
    const releaseVersion: string = core.getInput('release-version')
    const slackBotTokenInput: string = core.getInput('slack-bot-token')
    const slackChannel: string =
      core.getInput('slack-channel') || '#feed_agglayer-notifier'
    const releaseUrl: string = core.getInput('release-url')
    const releaseNotes: string = core.getInput('release-notes')
    const customMessage: string = core.getInput('custom-message')
    const maintainReleasesList: boolean =
      core.getInput('maintain-releases-list') === 'true'

    // Determine bot token - use input if provided, otherwise try Agglayer default
    let slackBotToken: string = slackBotTokenInput
    if (!slackBotToken) {
      slackBotToken = process.env.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE || ''
      if (slackBotToken) {
        core.info('Using default Agglayer bot token')
      }
    }

    // Validate required inputs
    if (!releaseVersion) {
      throw new Error('release-version is required')
    }
    if (!slackBotToken) {
      throw new Error(
        'slack-bot-token is required. Either provide it as an input or ensure SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE secret is available.'
      )
    }

    core.info(`Sending release notification for version: ${releaseVersion}`)
    core.debug(`Target channel: ${slackChannel}`)
    if (releaseNotes) {
      core.debug(`Release notes provided for breaking change analysis`)
    }
    if (maintainReleasesList) {
      core.debug(`Releases list maintenance enabled`)
    }

    // Analyze release notes for breaking changes and config changes
    const breakingAnalysis = analyzeBreakingChanges(releaseNotes)
    const configAnalysis = analyzeConfigChanges(releaseNotes)

    // Send the Slack notification
    await sendReleaseNotification(slackBotToken, slackChannel, {
      version: releaseVersion,
      releaseUrl: releaseUrl || undefined,
      releaseNotes: releaseNotes || undefined,
      customMessage: customMessage || undefined
    })

    core.info('Release notification sent successfully!')

    // Update releases list if enabled
    let releasesListUpdated = false
    if (maintainReleasesList) {
      const slack = new WebClient(slackBotToken)

      // Determine change type based on analysis
      let changeType: 'normal' | 'breaking' | 'config' = 'normal'
      if (breakingAnalysis.hasBreakingChanges) {
        changeType = 'breaking'
      } else if (configAnalysis.hasConfigChanges) {
        changeType = 'config'
      }

      releasesListUpdated = await updateReleasesListCanvas(
        slack,
        slackChannel,
        {
          version: releaseVersion,
          releaseDate: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }),
          changeType,
          hasBreaking: breakingAnalysis.hasBreakingChanges,
          hasConfig: configAnalysis.hasConfigChanges,
          releaseUrl: releaseUrl || undefined
        }
      )

      if (releasesListUpdated) {
        core.info('Releases list updated successfully!')
      } else {
        core.warning('Failed to update releases list')
      }
    }

    // Set outputs for other workflow steps to use
    core.setOutput('notification-sent', 'true')
    core.setOutput('timestamp', new Date().toISOString())
    core.setOutput('channel', slackChannel)
    core.setOutput('releases-list-updated', releasesListUpdated.toString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(`Failed to send release notification: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}
