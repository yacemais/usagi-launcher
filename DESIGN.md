# Usagi visual direction

Use the owner's supplied artwork directly. The original is a 5000×5000 transparent
PNG with a pink rabbit, one celestial sparkle and a spaced geometric USAGI wordmark.
Keep the actual wordmark image; do not approximate its font or draw another logo.

Warm charcoal (#272226), darker navigation (#211D21), muted pink (#DDA0B1), soft
off-white and restrained green status dots. The Home pairs one clear modpack action
with the owner's emblem. Body typography is Inter. No display serif, invented scenery,
moon/orbit illustrations, decorative statistics or fabricated news/status.

Navigation is Home, Social, News, Updates and Settings. Account sits in the title bar.
Visible launcher and community branding is Usagi / Usagi SMP. Legacy Celestia
storage and protocol identifiers are retained for compatibility and are not UI copy.
Updates separates the game from the application. Use clear headings, generous space,
readable 12–13px control text and visible keyboard focus. At 960×620, main content
scrolls while navigation/title bar stay usable. Respect reduced motion.

Startup reuses the transparent owner emblem/wordmark in a restrained 2.6 second CSS
fade/scale transition, starting after the native window is visible and the logo is
decoded. The 0.55 second entrance does not complete the splash; only the outer exit
animation does. Six small stars and a faint glow are
the only added decoration. Reduced motion skips the animation and delay. There is
no simulated loading progress. Social uses the same surfaces/type/buttons, a compact
friends column and a readable conversation; all real statuses come from the service.

Antislop mode: during implementation, as already selected by the owner. Both the
configured project-relative and user-cache antislop core/UI files were checked again
and remain absent. These explicit owner requirements guide implementation instead.
