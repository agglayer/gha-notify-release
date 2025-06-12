/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock the Slack WebClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPostMessage = jest.fn() as jest.MockedFunction<any>
const mockWebClient = jest.fn().mockImplementation(() => ({
  chat: {
    postMessage: mockPostMessage
  }
}))

// Mock GitHub context - make it mutable
let mockGitHubContext: any

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => ({
  context: {
    get repo() {
      return mockGitHubContext.repo
    },
    get payload() {
      return mockGitHubContext.payload
    }
  }
}))
jest.unstable_mockModule('@slack/web-api', () => ({
  WebClient: mockWebClient
}))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    // Reset GitHub context to default
    mockGitHubContext = {
      repo: {
        owner: 'owner',
        repo: 'repo'
      },
      payload: {
        release: {
          tag_name: 'v1.2.3',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
          body: 'Regular release with bug fixes and improvements'
        }
      }
    }

    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return 'releases'
        case 'custom-message':
          return 'Test release message'
        default:
          return ''
      }
    })

    // Mock Slack WebClient to simulate successful response
    mockPostMessage.mockResolvedValue({
      ok: true,
      channel: 'C1234567890',
      ts: '1234567890.123456'
    })

    // Clear environment variables
    delete process.env.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE
  })

  afterEach(() => {
    jest.resetAllMocks()
    delete process.env.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE
  })

  it('Sends notification and sets outputs with provided bot token', async () => {
    await run()

    // Verify that WebClient was instantiated with the bot token
    expect(mockWebClient).toHaveBeenCalledWith(
      'xoxb-123456789012-1234567890123-abcdefghijklmnop'
    )

    // Verify that postMessage was called with correct parameters
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: '#releases',
        text: '*New Release*: v1.2.3',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            color: '#36a64f', // Green for normal release
            blocks: expect.arrayContaining([
              expect.objectContaining({
                type: 'section',
                text: expect.objectContaining({
                  type: 'mrkdwn',
                  text: expect.stringContaining(
                    '🚀 *New Release*: v1.2.3 (owner/repo)'
                  )
                })
              })
            ])
          })
        ])
      })
    )

    // Verify the outputs were set correctly
    expect(core.setOutput).toHaveBeenCalledWith('notification-sent', 'true')
    expect(core.setOutput).toHaveBeenCalledWith(
      'timestamp',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    )
    expect(core.setOutput).toHaveBeenCalledWith('channel', 'releases')
  })

  it('Detects and highlights breaking changes in release notes', async () => {
    // Update GitHub context with breaking changes
    mockGitHubContext.payload.release.tag_name = 'v2.0.0'
    mockGitHubContext.payload.release.html_url =
      'https://github.com/owner/repo/releases/tag/v2.0.0'
    mockGitHubContext.payload.release.body = `## What's Changed
          
          ### Features
          - feat!: redesigned API with new authentication
          - Added new dashboard
          
          ## BREAKING CHANGES
          - Removed legacy /v1 endpoints
          - Changed response format for all APIs`

    // Mock inputs
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return 'releases'
        case 'custom-message':
          return 'Major release with breaking changes'
        default:
          return ''
      }
    })

    await run()

    // Verify that breaking changes are detected and highlighted
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '*BREAKING RELEASE*: v2.0.0',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            color: '#ff9900', // Orange for breaking release
            blocks: expect.arrayContaining([
              expect.objectContaining({
                text: expect.objectContaining({
                  text: expect.stringContaining(
                    '⚠️🚀 *BREAKING RELEASE*: v2.0.0 (owner/repo)'
                  )
                })
              })
            ])
          })
        ])
      })
    )

    // Verify breaking changes info is logged
    expect(core.info).toHaveBeenCalledWith(
      'Breaking changes highlighted in notification'
    )
  })

  it('Detects conventional commit breaking changes', async () => {
    // Update GitHub context with conventional commit breaking changes
    mockGitHubContext.payload.release.tag_name = 'v1.5.0'
    mockGitHubContext.payload.release.html_url =
      'https://github.com/owner/repo/releases/tag/v1.5.0'
    mockGitHubContext.payload.release.body = `### Commits in this release:
          - feat!: add new authentication system
          - fix: resolve memory leak
          - chore!: update dependencies with API changes`

    // Mock inputs
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return 'releases'
        default:
          return ''
      }
    })

    await run()

    // Verify breaking changes are detected from conventional commits
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '*BREAKING RELEASE*: v1.5.0',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            color: '#ff9900' // Orange for breaking release
          })
        ])
      })
    )
  })

  it('Uses environment variable when bot token input is not provided', async () => {
    // Set up environment variable
    process.env.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE = 'xoxb-env-token-12345'

    // Update GitHub context
    mockGitHubContext.payload.release.body = 'Regular release'

    // Mock getInput to return empty bot token
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return '' // Empty bot token input
        case 'slack-channel':
          return 'releases'
        case 'custom-message':
          return 'Test release message'
        default:
          return ''
      }
    })

    await run()

    // Verify that WebClient was instantiated with the environment variable token
    expect(mockWebClient).toHaveBeenCalledWith('xoxb-env-token-12345')

    // Verify info message about using default token
    expect(core.info).toHaveBeenCalledWith('Using default Agglayer bot token')
  })

  it('Uses default channel when not specified', async () => {
    // Update GitHub context
    mockGitHubContext.payload.release.body = 'Regular release'

    // Mock getInput to return empty channel (should default to '#feed_agglayer-notifier')
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return '' // Empty channel should default to '#feed_agglayer-notifier'
        case 'custom-message':
          return 'Test release message'
        default:
          return ''
      }
    })

    await run()

    // Verify that postMessage was called with default channel
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C090TACJ9KN'
      })
    )
  })

  it('Sets a failed status when no bot token is available', async () => {
    // Mock getInput to return missing bot token and no environment variable
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return '' // Missing bot token
        default:
          return ''
      }
    })

    await run()

    // Verify that the action was marked as failed
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(
        'slack-bot-token is required. Either provide it as an input or ensure SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE secret is available.'
      )
    )
  })

  it('Sets a failed status when Slack API fails', async () => {
    // Mock Slack WebClient to simulate API failure
    mockPostMessage.mockResolvedValue({
      ok: false,
      error: 'channel_not_found'
    })

    await run()

    // Verify that the action was marked as failed
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send release notification')
    )
  })

  it('Detects and highlights config changes in release notes', async () => {
    // Update GitHub context with config changes
    mockGitHubContext.payload.release.tag_name = 'v1.3.0'
    mockGitHubContext.payload.release.html_url =
      'https://github.com/owner/repo/releases/tag/v1.3.0'
    mockGitHubContext.payload.release.body = `## Configuration Updates
          
          Please update your config files:
          - [config.json](https://example.com/config.json) - Main configuration
          - Configuration settings updated for new feature
          
          \`\`\`diff
          {
            "api": {
          -   "timeout": 30000
          +   "timeout": 60000
            }
          }
          \`\`\``

    // Mock inputs
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return 'releases'
        case 'custom-message':
          return 'Config update release'
        default:
          return ''
      }
    })

    await run()

    // Verify that config changes are detected and highlighted
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '*CONFIG UPDATE*: v1.3.0',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            color: '#ffcc00', // Yellow for config changes
            blocks: expect.arrayContaining([
              expect.objectContaining({
                text: expect.objectContaining({
                  text: expect.stringContaining(
                    '⚙️🚀 *CONFIG UPDATE*: v1.3.0 (owner/repo)'
                  )
                })
              })
            ])
          })
        ])
      })
    )

    // Verify config changes info is logged
    expect(core.info).toHaveBeenCalledWith(
      'Configuration changes highlighted in notification'
    )
  })

  it('Prioritizes breaking changes over config changes', async () => {
    // Update GitHub context with both breaking and config changes
    mockGitHubContext.payload.release.tag_name = 'v2.0.0'
    mockGitHubContext.payload.release.html_url =
      'https://github.com/owner/repo/releases/tag/v2.0.0'
    mockGitHubContext.payload.release.body = `## Major Release
          
          ## BREAKING CHANGES
          - Removed legacy API endpoints
          
          ## Configuration Updates
          - [config.json](https://example.com/config.json) updated
          
          \`\`\`diff
          - old_setting: value
          + new_setting: value
          \`\`\``

    // Mock inputs
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return 'releases'
        default:
          return ''
      }
    })

    await run()

    // Verify that breaking changes take priority (orange color, breaking release type)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '*BREAKING RELEASE*: v2.0.0',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            color: '#ff9900' // Orange for breaking changes (not yellow for config)
          })
        ])
      })
    )

    // Verify both types of changes are logged
    expect(core.info).toHaveBeenCalledWith(
      'Breaking changes highlighted in notification'
    )
    expect(core.info).toHaveBeenCalledWith(
      'Configuration changes highlighted in notification'
    )
  })
})
