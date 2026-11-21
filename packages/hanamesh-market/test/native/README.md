# Desktop application installation smoke test

Use a disposable signed DSH Desktop profile at `$MCL1_ROOT/dsh/profiles/desktop` with the normal Market and AppHost archives installed. Configure AppHost with a verified standalone Node executable. Install `playwright-core` in the isolated runner and run the scripts with the runner's Node.

1. Start `market-application-fixture.mjs`. Set the Market's `websiteOrigin`, `serverOrigin`, and `registry` to the loopback origin recorded in `$MCL1_ROOT/fixture.json`. The fixture serves the catalog and app tarball locally and reads public npm metadata for the profile's existing locked packages.
2. Open the isolated Desktop with a loopback CDP port. Record it as `{"port":...}` in `$MCL1_ROOT/install.json` and run `node market-application-install.mjs install`.
3. Fully quit Desktop and reopen the same isolated profile with a CDP port recorded in `$MCL1_ROOT/after-restart.json`. Run `node market-application-install.mjs after-restart`.

The install test uses the native Plugins → HanaMesh tab and one Market confirmation. It checks the exact saved version, the provisioned runtime's real ledger and archive hash, and the success message. The second check verifies the app is registered after restart.
