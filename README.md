# Slack Release Notifier Action

A GitHub Action that sends beautiful release notifications to Slack using a bot
token with intelligent breaking change detection.

## Features

- 🚀 Sends formatted release notifications to Slack
- ⚠️ **Smart breaking change detection** from release notes and conventional
  commits
- 🎨 **Visual highlighting** with color-coded messages for breaking releases
- 📝 Supports custom messages
- 🔗 Includes release URLs
- ✨ Beautiful formatting with emojis and timestamps
- 🎯 Flexible channel targeting
- 🔧 Simple setup with Slack bot tokens
- ⚡ Zero configuration for Agglayer projects

## Breaking Change Detection

The action automatically analyzes release notes and detects breaking changes
using multiple methods:

### 🔍 Detection Methods

1. **Conventional Commits**: Detects `!` markers (e.g., `feat!:`, `fix!:`)
2. **BREAKING CHANGE sections**: Finds explicit "BREAKING CHANGES" sections
3. **Keywords**: Identifies breaking change keywords like "removed",
   "deprecated", "incompatible"
4. **Major versions**: Detects major version bumps (e.g., v2.0.0, v3.0.0)

### 🎨 Visual Indicators

- **Normal releases**: 🚀 Green sidebar, "New Release"
- **Breaking releases**: ⚠️🚀 Orange sidebar, "BREAKING RELEASE" with detailed
  breakdown

## Quick Start (For Agglayer Projects)

If you're using this in an Agglayer repository, it works out of the box with no
token configuration needed:

```yaml
- name: Notify Slack
  uses: agglayer/gha-notify-release@v1
  with:
    release-version: ${{ github.event.release.tag_name }}
    release-notes: ${{ github.event.release.body }}
    release-url: ${{ github.event.release.html_url }}
    custom-message: '🎉 New XXX release is now available!'
```

That's it! The action automatically uses the pre-configured Agglayer bot token.

## Setup (For Other Projects)

### 1. Create a Slack App and Bot

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name your app (e.g., "Release Notifier") and select your workspace
4. Go to **"OAuth & Permissions"** in the sidebar
5. Scroll down to **"Scopes"** and add these Bot Token Scopes:
   - `chat:write` - Send messages
   - `chat:write.public` - Send messages to channels the app isn't in
6. Click **"Install to Workspace"** at the top
7. Copy the **"Bot User OAuth Token"** (starts with `xoxb-`)

### 2. Add the Bot to Channels

For each channel where you want notifications:

1. Go to the Slack channel
2. Type `/invite @YourBotName` (replace with your bot's name)
3. Or go to channel settings → Integrations → Add apps

### 3. Add the Bot Token to GitHub Secrets

1. In your GitHub repository, go to Settings → Secrets and variables → Actions
2. Click **"New repository secret"**
3. Name: `SLACK_BOT_TOKEN` (or use your own secret name)
4. Value: Your bot token from step 1 (starts with `xoxb-`)
5. Click **"Add secret"**

## Usage

### For Agglayer Projects (Zero Config)

```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: agglayer/gha-notify-release@v1
        with:
          release-version: ${{ github.event.release.tag_name }}
          release-notes: ${{ github.event.release.body }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: '🎉 New Agglayer release is now available!'
```

### For Other Projects

```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: agglayer/gha-notify-release@v1
        with:
          release-version: ${{ github.event.release.tag_name }}
          slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack-channel: 'releases' # or '#releases' or channel ID
          release-notes: ${{ github.event.release.body }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: '🎉 Our latest release is now available!'
```

## Inputs

| Input             | Description                                                              | Required | Default                   |
| ----------------- | ------------------------------------------------------------------------ | -------- | ------------------------- |
| `release-version` | The version of the release                                               | Yes      | `X.Y.Z`                   |
| `slack-bot-token` | Slack Bot Token (starts with xoxb-). Auto-detected for Agglayer projects | No       | -                         |
| `slack-channel`   | Channel name (#releases), name (releases), or ID (C1234567890)           | No       | `#feed_agglayer-notifier` |
| `release-url`     | URL to the release page                                                  | No       | -                         |
| `release-notes`   | Release notes/body for breaking change analysis                          | No       | -                         |
| `custom-message`  | Custom message to include with the release notification                  | No       | -                         |

## Outputs

| Output              | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `notification-sent` | Whether the notification was sent successfully (`true`/`false`) |
| `timestamp`         | ISO timestamp of when the notification was sent                 |
| `channel`           | The channel where the notification was sent                     |

## Channel Formats

You can specify the Slack channel in multiple ways:

- **Channel name**: `releases` or `general`
- **With hash**: `#releases` or `#general`
- **Channel ID**: `C1234567890` (useful for private channels)

## Example Notifications

### Normal Release

```
🚀 New Release: v1.2.3

🎉 Bug fixes and improvements are here!

🔗 View Release

Released at 2024-01-15T10:30:00.000Z
```

### Breaking Release

```
⚠️🚀 BREAKING RELEASE: v2.0.0

🎉 Major update with new features!

⚠️ BREAKING CHANGES DETECTED

Conventional Commit Breaking Changes:
• feat!: redesigned authentication system
• chore!: updated API endpoints

Breaking Changes from Release Notes:
• Removed legacy /v1 endpoints
• Changed response format for all APIs

🔍 Please review the changes carefully before updating!

🔗 View Release

Released at 2024-01-15T10:30:00.000Z
```

## Breaking Change Examples

The action detects various patterns of breaking changes:

### Conventional Commits

```markdown
- feat!: redesign user authentication
- fix!: remove deprecated payment methods
- chore!: update dependencies with breaking changes
```

### Explicit Sections

```markdown
## BREAKING CHANGES

- Removed legacy API endpoints
- Changed response format
```

### Keywords

```markdown
- Removed support for Node.js < 16
- Deprecated old authentication system
- API change: updated all endpoints
- No longer supports Internet Explorer
```

## Advanced Usage

### Multiple Channels

```yaml
- name: Notify Multiple Channels
  strategy:
    matrix:
      channel: ['releases', 'general', 'engineering']
  uses: agglayer/gha-notify-release@v1
  with:
    release-version: ${{ github.event.release.tag_name }}
    slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
    slack-channel: ${{ matrix.channel }}
    release-notes: ${{ github.event.release.body }}
```

### Conditional Notifications

```yaml
- name: Notify Slack (Production Only)
  if: startsWith(github.event.release.tag_name, 'v')
  uses: agglayer/gha-notify-release@v1
  with:
    release-version: ${{ github.event.release.tag_name }}
    slack-channel: 'releases'
    release-notes: ${{ github.event.release.body }}
```

### Override Bot Token (Agglayer Projects)

If an Agglayer project needs to use a different bot token:

```yaml
- name: Notify Slack with Custom Bot
  uses: agglayer/gha-notify-release@v1
  with:
    release-version: ${{ github.event.release.tag_name }}
    slack-bot-token: ${{ secrets.CUSTOM_SLACK_BOT_TOKEN }}
    slack-channel: 'releases'
```

## How It Works

### Bot Token Detection

The action automatically detects the environment:

1. **If `slack-bot-token` is provided**: Uses the provided token
2. **If no token provided**: Automatically looks for
   `SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE` secret
3. **If neither available**: Shows helpful error message

This means Agglayer projects get zero-configuration usage, while other projects
maintain full flexibility.

### Breaking Change Analysis

The action analyzes the `release-notes` input using multiple detection methods:

1. **Regex patterns** for conventional commit markers (`!`)
2. **Section parsing** for explicit "BREAKING CHANGES" sections
3. **Keyword detection** for common breaking change terms
4. **Version analysis** for major version bumps

Results are formatted with appropriate visual indicators and detailed
breakdowns.

## Troubleshooting

### Bot Token Issues

- Make sure your token starts with `xoxb-`
- Verify the bot has `chat:write` and `chat:write.public` permissions
- Check that the bot is installed in your workspace
- For Agglayer projects: Ensure the `SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE`
  secret is available

### Channel Issues

- Ensure the bot is added to private channels
- Use channel ID for private channels if channel name doesn't work
- Verify channel name spelling (case-sensitive)

### Permission Errors

- Add the bot to the target channel: `/invite @YourBotName`
- For public channels, `chat:write.public` scope allows posting without
  invitation

### Breaking Change Detection

- Ensure `release-notes` input contains the release body
- Use conventional commit format for best detection: `type!: description`
- Include explicit "BREAKING CHANGES" sections in release notes
- Check that keywords like "removed", "deprecated" are properly formatted

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

### Complete Workflow Examples

#### Basic Agglayer Release Workflow
```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack of Release
        uses: agglayer/gha-notify-release@v1
        with:
          release-version: ${{ github.event.release.tag_name }}
          release-notes: ${{ github.event.release.body }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: |
            🎉 New ${{ github.repository }} release is available!
            
            **Repository:** ${{ github.repository }}
            **Actor:** ${{ github.actor }}
```

#### Advanced Multi-Channel Notification
```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-release:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        notification:
          - channel: 'releases'
            message: '🚀 Production release deployed!'
          - channel: 'engineering'
            message: '👨‍💻 New version available for review'
          - channel: 'product'
            message: '📋 Release notes ready for documentation'
    steps:
      - name: Notify Slack Channel
        uses: agglayer/gha-notify-release@v1
        with:
          release-version: ${{ github.event.release.tag_name }}
          slack-channel: ${{ matrix.notification.channel }}
          release-notes: ${{ github.event.release.body }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: ${{ matrix.notification.message }}
```

#### Conditional Breaking Change Alerts
```yaml
name: Release Notification

on:
  release:
    types: [published]

jobs:
  notify-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack of Release
        uses: agglayer/gha-notify-release@v1
        with:
          release-version: ${{ github.event.release.tag_name }}
          release-notes: ${{ github.event.release.body }}
          release-url: ${{ github.event.release.html_url }}
          custom-message: |
            ${{ startsWith(github.event.release.tag_name, 'v') && contains(github.event.release.body, 'BREAKING') && '🚨 **CRITICAL UPDATE** 🚨' || '✨ Regular update available' }}
            
            Release: ${{ github.event.release.tag_name }}
            Changelog: See release notes for details
```
