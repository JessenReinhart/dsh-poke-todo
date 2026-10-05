# Permanent Profile Installation

Dynamic plugins loaded through `cordis_define` live in the running process and do not survive a DSH restart. This repository also ships a static Cordis module and `dsh.bundle.patch` profile layer.

## Install the desktop profile

From the repository root:

```powershell
node scripts/install.mjs --profile desktop --from local
```

The installer runs `pnpm add link:<repository>`, verifies that the installed package declares `dsh.bundle.patch`, and appends `dsh-poke-todo` to the profile manifest (`%USERPROFILE%\.dsh\profiles\<name>\package.json`) under `dsh.profile.bundles`. The resulting profile dependency is visible with:

```powershell
dsh plugin --profile desktop list
```

The profile then lists `dsh-poke-todo` as a linked or registry dependency alongside a matching `dsh.profile.bundles` entry.

## Static package shape

- `lib/index.js` exports the Cordis `name`, `inject`, and `apply` contract.
- `cordis.patch.yml` inserts the `poke-todo` row into the composed bundle.
- No dynamic `harness.handle` or client approval is needed for the static profile module.

Reload DSH Desktop (Ctrl+R/F5) or restart it to load the newly composed profile. The running session used during development remains on the dynamic package until restart.

## Dynamic fallback

If profile installation is unavailable, regenerate the dynamic payload and re-run it:

```powershell
node scripts/define-payload.mjs
```

Call `cordis_define`, then `cordis_run` with the returned `pluginId` and `packageId`. Dynamic registrations require approval when a client half is present and remain process-local.
