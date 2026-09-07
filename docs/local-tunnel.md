# Local development tunnel

`https://tunnel.sdqst.app` forwards webhook requests to Sidequest on `http://localhost:3000` through the named Cloudflare Tunnel `sidequest-dev`. Its hostname persists across restarts. Both the app and tunnel must be running for webhooks to reach your machine. Browse and sign in to Sidequest at `http://localhost:3000`.

Start these in separate terminals:

```sh
bun run dev
```

```sh
bun run dev:tunnel
```

Use `BETTER_AUTH_URL=http://localhost:3000` in `.dev.vars`, including when testing GitHub sign-in. Restart the dev server after changing the setting.

The dev GitHub App uses `http://localhost:3000/api/auth/callback/github` for its authorization callback, `http://localhost:3000/` for its homepage and setup URL, and `https://tunnel.sdqst.app/api/github/webhook` for webhooks. The same tunnel can receive Polar sandbox webhooks at `https://tunnel.sdqst.app/api/billing/webhook`; update the sandbox webhook destination separately when switching from the temporary billing tunnel.

## Machine configuration

The tunnel ID is `cab034b4-f9de-4ab8-b46f-343e67c40942`. Its configuration lives at `~/.cloudflared/sidequest-dev.yml`:

```yaml
tunnel: cab034b4-f9de-4ab8-b46f-343e67c40942
credentials-file: /Users/jamie/.cloudflared/cab034b4-f9de-4ab8-b46f-343e67c40942.json

ingress:
  - hostname: tunnel.sdqst.app
    path: ^/api/(github|billing)/webhook$
    service: http://localhost:3000
    originRequest:
      httpHostHeader: localhost:3000
  - service: http_status:404
```

The Host override lets Vite accept tunneled webhook requests. The path rule only forwards the GitHub and billing webhook endpoints. The fallback returns 404 for all other paths and hostnames, including sign-in and OAuth callbacks.

Cloudflare DNS routes `tunnel.sdqst.app` to `cab034b4-f9de-4ab8-b46f-343e67c40942.cfargotunnel.com` using a proxied CNAME. The tunnel credentials and `cert.pem` stay outside the repository. On another machine, securely provision the existing tunnel credentials and adjust `credentials-file` to that machine’s absolute path. Only run this shared development tunnel on the machine you want to receive requests; multiple connectors can distribute traffic between machines.

Check configuration and connections with:

```sh
cloudflared tunnel --config ~/.cloudflared/sidequest-dev.yml ingress validate
cloudflared tunnel info sidequest-dev
```

The tunnel is started manually, without a login or boot service. Stop it with Ctrl+C in its terminal. Stopping it leaves the tunnel and DNS record available for the next run.

Reference: [Cloudflare tunnel configuration](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/).

Documentation checked with Context7 `/cloudflare/cloudflare-docs` for ingress path matching; cloudflared documentation has no pinned version.
