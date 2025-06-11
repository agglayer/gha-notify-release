# Slack Release Notifier Action

A GitHub Action that sends beautiful release notifications to Slack using a bot
token.

## Features

- 🚀 Sends formatted release notifications to Slack
- 📝 Supports custom messages
- 🔗 Includes release URLs
- ✨ Beautiful formatting with emojis and timestamps
- 🎯 Flexible channel targeting
- 🔧 Simple setup with Slack bot tokens
- ⚡ Zero configuration for Agglayer projects

## Quick Start (For Agglayer Projects)

If you're using this in an Agglayer repository, it works out of the box with no
token configuration needed:

```yaml
- name: Notify Slack
  uses: agglayer/gha-notify-release@v1
  with:
    release-version: ${{ github.event.release.tag_name }}
    slack-channel: 'releases'
    release-url: ${{ github.event.release.html_url }}
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
          release-url: ${{ github.event.release.html_url }}
          custom-message: '🎉 New XXX release is now available!'
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
          release-url: ${{ github.event.release.html_url }}
          custom-message: '🎉 Our latest release is now available!'
```

## Inputs

| Input             | Description                                                              | Required | Default   |
| ----------------- | ------------------------------------------------------------------------ | -------- | --------- |
| `release-version` | The version of the release                                               | Yes      | `X.Y.Z`   |
| `slack-bot-token` | Slack Bot Token (starts with xoxb-). Auto-detected for Agglayer projects | No       | -         |
| `slack-channel`   | Channel name (#releases), name (releases), or ID (C1234567890)           | No       | `general` |
| `release-url`     | URL to the release page                                                  | No       | -         |
| `custom-message`  | Custom message to include with the release notification                  | No       | -         |

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

## Example Notification

The action sends a beautifully formatted message to Slack:

```
🚀 New Release: v1.2.3

🎉 Our latest release is now available!

🔗 View Release

Released at 2024-01-15T10:30:00.000Z
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
```

### Conditional Notifications

```yaml
- name: Notify Slack (Production Only)
  if: startsWith(github.event.release.tag_name, 'v')
  uses: agglayer/gha-notify-release@v1
  with:
    release-version: ${{ github.event.release.tag_name }}
    slack-channel: 'releases'
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

The action automatically detects the environment:

1. **If `slack-bot-token` is provided**: Uses the provided token
2. **If no token provided**: Automatically looks for
   `SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE` secret
3. **If neither available**: Shows helpful error message

This means Agglayer projects get zero-configuration usage, while other projects
maintain full flexibility.

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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
