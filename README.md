# Perspective Agents Push Bridge

> **Coming soon.** This is an official add-on for **OpenClaw** that powers
> background push notifications in the upcoming **Perspective Agents**
> iOS and macOS app. The app has not shipped yet — star or watch this
> repo to follow along.

Add real push notifications to Perspective Agents — even when the app is
closed or backgrounded. This add-on runs on the same machine as your
**OpenClaw gateway**, watches for new agent messages, and hands them to
the Techopolis-hosted push relay, which delivers them to your iPhone or
iPad via Apple Push Notification service.

No APNs key, no Apple developer account, no certificates. One command
to install.

## One-line install (Linux + systemd)

Grab your relay auth token from the Perspective Agents app (Help →
Background push notifications → Copy install command). Then run this on
the server where your OpenClaw gateway is running:

```bash
curl -sSL https://raw.githubusercontent.com/taylorarndt/perspective-push-bridge/main/install.sh \
  | sudo RELAY_AUTH=<token> bash
```

That's it. Open Perspective Agents, tap **Allow** when iOS asks about
notifications, and you're done.

> The installer will refuse to run without `RELAY_AUTH`. This keeps
> random people from turning your gateway into their push pipeline.

## What the installer does

1. Installs Node.js 20 if it isn't already there.
2. Drops the watcher at `/opt/perspective-push-bridge/`.
3. Writes a systemd unit called `perspective-push-bridge`.
4. Starts it and enables it at boot.

## Verify

```bash
systemctl status perspective-push-bridge
journalctl -u perspective-push-bridge -f
```

## Uninstall

```bash
curl -sSL https://raw.githubusercontent.com/taylorarndt/perspective-push-bridge/main/uninstall.sh | sudo bash
```

## Configuration

All settings live in `/opt/perspective-push-bridge/.env`. The common ones:

| Variable       | Default                                             | Purpose                                      |
|----------------|-----------------------------------------------------|----------------------------------------------|
| `WATCH_DIRS`   | `$HOME/.openclaw/agents/main/sessions`              | Colon-separated list of session directories. |
| `NOTIFY_TITLE` | `Perspective Agents`                                | Title shown on the push.                     |
| `RELAY_URL`    | Techopolis-hosted                                   | Push relay endpoint. Override for self-host. |

Restart after changes:

```bash
sudo systemctl restart perspective-push-bridge
```

## FAQ

**Do I need an Apple developer account?**
No. Techopolis holds the APNs key and hosts the relay. You only register
your device token by running the app once.

**Does it watch every agent I run?**
Yes — it tails `.jsonl` session files for every agent under the
configured `WATCH_DIRS`. Override the variable to narrow it down.

**Is my message content sent to Techopolis?**
Yes — the first ~180 characters of each assistant message are relayed so
the notification has a useful preview. Nothing is stored long-term on
the relay; it is only forwarded to APNs. Self-host the relay if this
does not meet your policy.

**Can I self-host the relay?**
Yes. Source for the relay lives in the Perspective Agents repo under
`addons/push-relay/`. Point `RELAY_URL` at your own instance.
