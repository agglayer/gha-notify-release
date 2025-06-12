import * as core from '@actions/core'
import * as github from '@actions/github'
import { sendReleaseNotification } from './slack.js'
import { analyzeBreakingChanges } from './breaking-changes.js'
import { analyzeConfigChanges } from './config-analysis.js'
import { analyzeE2ETests } from './e2e-analysis.js'
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
    let slackBotToken: string = core.getInput('slack-bot-token')
    const slackChannel: string =
      core.getInput('slack-channel') || '#feed_agglayer-notifier'
    const releaseUrl: string = core.getInput('release-url')
    const customMessage: string = core.getInput('custom-message')
    const maintainReleasesList: boolean =
      core.getInput('maintain-releases-list') === 'true'

    // Get release notes from GitHub context
    const releaseNotes: string =
      (github.context.payload.release?.body as string) || ''

    // Validate required inputs
    if (!releaseVersion) {
      throw new Error('release-version is required')
    }

    // Handle bot token with fallback to environment variable
    if (!slackBotToken) {
      // Try to get token from environment variable as fallback
      const fallbackToken = process.env.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE
      if (fallbackToken) {
        slackBotToken = fallbackToken
        core.info('Using default Agglayer bot token')
      } else {
        throw new Error(
          'slack-bot-token is required. Either provide it as an input or ensure SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE secret is available.'
        )
      }
    }

    core.info(`Sending release notification for version: ${releaseVersion}`)
    core.debug(`Target channel: ${slackChannel}`)
    core.debug(`Release notes length: ${releaseNotes.length} characters`)
    if (maintainReleasesList) {
      core.debug(`Releases list maintenance enabled`)
    }

    // Analyze release notes for breaking changes, config changes, and e2e tests
    const breakingAnalysis = analyzeBreakingChanges(releaseNotes)
    const configAnalysis = analyzeConfigChanges(releaseNotes)
    const e2eAnalysis = analyzeE2ETests(releaseNotes)

    // Get repository name from GitHub context
    const repositoryName =
      github.context.repo.owner + '/' + github.context.repo.repo

    // Send the Slack notification
    await sendReleaseNotification(slackBotToken, slackChannel, {
      version: releaseVersion,
      releaseUrl: releaseUrl || undefined,
      releaseNotes: releaseNotes || undefined,
      customMessage: customMessage || undefined,
      repositoryName
    })

    core.info('Release notification sent successfully!')

    // Update releases list if enabled
    let releasesListUpdated = false
    if (maintainReleasesList) {
      const slack = new WebClient(slackBotToken)

      // Determine change type based on analysis (priority: breaking > config > e2e > normal)
      let changeType: 'normal' | 'breaking' | 'config' | 'e2e' = 'normal'
      if (breakingAnalysis.hasBreakingChanges) {
        changeType = 'breaking'
      } else if (configAnalysis.hasConfigChanges) {
        changeType = 'config'
      } else if (e2eAnalysis.hasE2ETests) {
        changeType = 'e2e'
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
          hasE2E: e2eAnalysis.hasE2ETests,
          releaseUrl: releaseUrl || undefined
        }
      )

      if (releasesListUpdated) {
        core.info('Releases list Canvas updated successfully!')
      } else {
        core.warning(
          'Failed to update releases list Canvas. Check if the bot has canvases:write permission and access to the channel.'
        )
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
