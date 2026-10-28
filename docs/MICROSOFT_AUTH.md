# Microsoft sign-in: implementation and owner setup

The owner registered Usagi with client ID **ee966e53-e97c-46eb-b6ea-6de2cca23fd5**.
It is now bundled in config/usagi.json. Real Microsoft browser sign-in, Xbox Live
and XSTS passed with the owner completing sign-in. Minecraft Services then rejected
the application with HTTP 403, **Invalid app registration**. Full Minecraft sign-in
is blocked by application access and is not claimed working.
The callback protocol, ownership rejection, cancellation, protected persistence,
refresh orchestration and logout are exercised with explicit service fixtures.

## Exact settings for the registered Usagi app

| Entra setting | Value required by this implementation |
| --- | --- |
| Application (client) ID | ee966e53-e97c-46eb-b6ea-6de2cca23fd5 |
| Supported account types | Organizational and personal accounts is acceptable; Minecraft/Xbox login uses a personal Microsoft account |
| Platform | Mobile and desktop applications (public/native), not Web or SPA |
| Registered redirect URI | **http://localhost** |
| Runtime redirect | http://localhost:<OS-assigned-port>, root path; the listener binds only 127.0.0.1 |
| Allow public client flows | Yes, for the optional device-code fallback |
| Implicit access-token / ID-token checkboxes | Not used by this authorization-code flow; leave disabled for Usagi |
| Client secret | None; do not create or embed one |
| Authority used by Usagi | https://login.microsoftonline.com/consumers |
| Requested scopes | XboxLive.signin and offline_access; MSAL supplies its OIDC scopes |

The registered redirect has no fixed port or custom callback path. Microsoft's
localhost exception allows the temporary port to vary. GitHub Pages is only file/feed
hosting and must not replace this desktop redirect. A broader Entra account audience
does not make organizational-only accounts into Xbox/Minecraft gaming identities.

## Configuration checklist

1. Sign in to https://entra.microsoft.com and open the existing Usagi registration
   with the client ID above. Do not create a second application for this build.
2. Keep support for organizational **and personal** accounts. That setting is valid;
   sign in to the launcher with a personal account that owns Minecraft Java. Usagi
   deliberately uses the `consumers` authority for the Xbox/Minecraft flow.
3. Under **Authentication**, add the **Mobile and desktop applications** platform.
   Register **http://localhost** for the system-browser callback. Usagi binds only
   127.0.0.1 on a random local port and uses the root path. Microsoft ignores the port
   when matching a registered localhost redirect; no public callback server is needed.
4. Enable **Allow public client flows** for the device-code fallback. Do not add a
   client secret. Do not register the browser flow as a confidential web application.
5. The public client ID is already integrated in `config/usagi.json`. The bundled
   registration takes priority over older manual settings. Rebuild to distribute
   changes; a client secret is never needed.
6. Verify that the registration is authorized for the Xbox/Minecraft services required
   by this launcher. The code requests XboxLive.signin and offline_access. A valid
   Entra registration by itself does not establish that Minecraft will authorize it.
   If Minecraft returns a registration/access rejection, ask Minecraft support for the
   current application-access process. Do not use another launcher's client ID.

Microsoft registration and loopback references:
- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- https://learn.microsoft.com/en-us/entra/msal/javascript/node/acquire-token-requests
- https://github.com/MicrosoftDocs/entra-docs/blob/main/docs/identity-platform/quickstart-desktop-app-sign-in.md

Minecraft Services explicitly returned Invalid app registration for Usagi during
the real test. The response's official information link, https://aka.ms/AppRegInfo,
currently redirects to help.minecraft.net. The application-review link
https://aka.ms/mce-reviewappid currently redirects to Microsoft's Forms service.
The form's full contents, acceptance status and review timeline were not verified.
Submit/request review for Usagi's own client ID using the official process; approval
is not promised by creating an Entra registration or changing OAuth scopes.
Do not substitute another launcher's client ID. Once access is granted, rerun the
real ownership/profile checks and the persistence, refresh and logout test sequence.

For an application access request, use these nonsecret facts:
- Application: Usagi Launcher; Windows desktop/public client, no client secret.
- Client ID: ee966e53-e97c-46eb-b6ea-6de2cca23fd5.
- Source/site: https://github.com/yacemais/usagi-launcher and
  https://yacemais.github.io/usagi-launcher/.
- Flow: system browser, authorization code with S256 PKCE, Xbox Live, XSTS,
  Minecraft Java entitlement/profile checks.
- Observed denial: POST /authentication/login_with_xbox, HTTP 403,
  Invalid app registration, after successful Microsoft/Xbox/XSTS authentication.
- Reproduction timestamp: 2026-10-28 16:24:34 UTC.

No support request or review form was submitted by the development tools. Never
include passwords, OAuth codes/tokens, Xbox/XSTS tokens or protected account files.

## Implemented flow

The default button opens the system browser through Microsoft's allowlisted HTTPS
authorization URL. MSAL produces a PKCE verifier/challenge; Usagi adds cryptographically
random state and nonce. A temporary local HTTP listener accepts only the expected
host/path and matching state. The one-use authorization code is exchanged with its
PKCE verifier and expected nonce. Tokens/passwords are never collected by React.

The Microsoft token is exchanged through Xbox Live and XSTS for a Minecraft session.
Java entitlement and a valid Minecraft UUID/name must succeed before an account is
published and its cache saved. Before launching, silent Microsoft refresh and the
Minecraft checks run again. No offline identity or cracked-login path exists.

Cancellation closes the callback listener, aborts network requests, signals device
poll cancellation and rejects late results. A cancelled attempt must settle before
another account operation begins. Credential write failures do not publish a new
account. MSAL caches and profile metadata use Windows safeStorage/DPAPI. Minecraft
access tokens stay in main-process memory; logs redact registered secrets.

## Required real-account test

On 28 October 2026, the real public authorization endpoint accepted both portless
localhost and ephemeral-port localhost redirects after the owner saved the desktop
redirect. A real system-browser login then completed the code/PKCE exchange, Xbox
Live authentication and XSTS authorization. The next endpoint,
api.minecraftservices.com/authentication/login_with_xbox, returned HTTP 403 with
Invalid app registration. The follow-up run reproduced the same denial using the
improved status/code diagnostics. No token exchange was mocked and no client secret
was used. No account was published or saved after the rejected Minecraft exchange.
Ownership, profile, real saved-account refresh and logout remain untested.

After registration/API access is ready: sign in with a consenting Java owner, restart
Usagi, refresh and launch, sign out, restart and confirm the account is gone. Also
test a non-owner account, denied browser consent, cancellation, expired session,
multiple real accounts and family/Xbox restrictions. Do not publish screenshots with
device codes, authorization URLs, tokens or private account caches.
