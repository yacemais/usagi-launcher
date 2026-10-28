# Installation and upgrades

Usagi 0.2.0 is the renamed launcher. The installer app identity and legacy application
data folder below are deliberately retained. Existing game files and settings are
not moved or reset. New settings default the launcher release channel to stable.
For a configured public build, fill config/usagi.json and rebuild once before release.

Use Windows 10/11, x64, with internet access for official game downloads and sign-in.
The default RAM allocation is 6 GB, bounded by physical RAM with a 2 GB reserve.
The application can download its own Java 17; an existing 64-bit Java 17 executable
may be chosen instead. No special JVM flags, administrator account or Prism changes
are required for ordinary use.

Run the unsigned NSIS installer when available in `release/`. Its identity is not
verified by a publisher certificate; review the source/build and supplied checksums
before use. Alternatively run `release/win-unpacked/Usagi.exe`.

Application data is outside the installation folder:

```text
%APPDATA%/CelestiaLauncher/
  settings.json
  accounts.protected
  logs/
  runtime/java17/
  runtime/minecraft/
  runtime/runtime-receipt.json
  game/.celestia-owner.json
  game/.celestia/installed.json
  game/.celestia/transactions/
```

Game directory is configurable. Choose an empty dedicated folder; the application
refuses to adopt a nonempty folder without its ownership marker. Do not point it at
Prism or an existing SMP development folder. Normal updates preserve worlds,
screenshots, logs, untracked mods, player resource packs and seeded personal settings.

Configure the official application client ID and signed pack source in Settings.
Install, sign in through Microsoft's page, then launch after verification passes.
Missing production configuration is shown honestly and does not enable PLAY.

Upgrades retain application data. Back up the game folder and settings before changing
release versions. Credentials use Windows account protection and are not portable:
sign in again on another Windows account/computer. Uninstall is configured to retain
application data. Uninstall/install behavior still needs an interactive machine test.

For an isolated/portable data folder, set `CELESTIA_DATA_DIR` to a dedicated absolute
path before launching. This changes data location only; it does not bypass sign-in,
verification or security. The folder must exist. Avoid characters outside the Windows
Java code page until the Java compatibility limitation is resolved.

Use Settings > Open logs after failures. `launcher.log` records operations,
`installer.log` records Forge processor output, and `game.log` receives real Java
process output. The game also creates its ordinary logs/crash reports. Never post
credentials or raw private account caches with a support report.
