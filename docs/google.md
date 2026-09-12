# Google login and Calendar

Create an OAuth web client in Google Cloud and set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` as Worker secrets (`.dev.vars` locally). Both are optional;
Google login and Calendar controls become available when both are configured.

Enable the Google Calendar API in the same Cloud project. Configure the OAuth
consent screen with the app's identity, authorized domains, and test users while
in Testing. Declare the identity scopes (`openid`, `email`, `profile`) and
`https://www.googleapis.com/auth/calendar.app.created`. Google may require consent
verification before publishing. Testing-mode refresh tokens can expire after seven
days, requiring reconnection.

Register the exact redirect URI for each environment:
`https://YOUR_HOST/api/auth/callback/google` (locally,
`http://localhost:3000/api/auth/callback/google`).

Normal login requests identity scopes. The switch at `/settings` separately links
a Google account with Calendar permission, offline access, and consent. Tokens stay
in Better Auth's encrypted account storage. Disable deletes the dedicated calendar
and keeps Google login connected.
