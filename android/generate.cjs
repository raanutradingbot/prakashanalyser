// Generates the Android TWA project directly, bypassing Bubblewrap's
// interactive wizard (which can't work over this tool's non-interactive
// shell). Mirrors exactly what `bubblewrap init` does internally — see
// node_modules/@bubblewrap/cli/dist/lib/cmds/init.js — just with answers
// supplied programmatically instead of via inquirer prompts.
const path = require("node:path");
const { TwaManifest, TwaGenerator, ConsoleLog } = require("@bubblewrap/core");

const MANIFEST_URL = "https://prakashanalyser.duckdns.org/manifest.webmanifest";
const TARGET_DIR = __dirname;
const KEYSTORE_PATH = "C:\\Users\\Archana Arjunraj\\Documents\\PrakashAnalyser-signing\\release-keystore.jks";
const KEYSTORE_ALIAS = "prakashanalyser";

async function main() {
  const twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);

  // Fields a human would normally answer in the wizard:
  twaManifest.packageId = "com.prakashanalyser.twa";
  twaManifest.name = "PrakashAnalyser";
  twaManifest.launcherName = "PrakashAnalyser";
  twaManifest.appVersionCode = 1;
  twaManifest.appVersionName = "1.0.0";
  twaManifest.signingKey.path = KEYSTORE_PATH;
  twaManifest.signingKey.alias = KEYSTORE_ALIAS;
  // androidbrowserhelper 2.7.4 (a TWA dependency) requires minSdk 24+; the
  // library default of 21 fails the manifest merge.
  twaManifest.minSdkVersion = 24;

  console.log("Resolved manifest:", {
    host: twaManifest.host,
    packageId: twaManifest.packageId,
    name: twaManifest.name,
    launcherName: twaManifest.launcherName,
    themeColor: twaManifest.themeColor.hex(),
    backgroundColor: twaManifest.backgroundColor.hex(),
    iconUrl: twaManifest.iconUrl,
    maskableIconUrl: twaManifest.maskableIconUrl,
    signingKey: twaManifest.signingKey,
  });

  await twaManifest.saveToFile(path.join(TARGET_DIR, "twa-manifest.json"));

  const log = new ConsoleLog("generate");
  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(TARGET_DIR, twaManifest, log, () => {});

  console.log("\nAndroid project generated successfully in", TARGET_DIR);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
