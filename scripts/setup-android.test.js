import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mainActivitySource, syncNativeSources } from "./setup-android.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "com.ql796907.paperglossary";

function javaDirOf(androidRoot, name) {
  return path.join(androidRoot, "app", "src", "main", "java", ...name.split("."));
}

test("splash handoff uses a NoActionBar theme and is installed before super.onCreate", () => {
  const source = mainActivitySource();
  const installAt = source.indexOf("SplashScreen.installSplashScreen(this);");
  const superAt = source.indexOf("super.onCreate(savedInstanceState);");
  assert.ok(installAt !== -1);
  assert.ok(superAt !== -1);
  assert.ok(installAt < superAt);

  const styles = fs.readFileSync(
    path.join(repoRoot, "android", "app", "src", "main", "res", "values", "styles.xml"),
    "utf8",
  );
  assert.match(styles, /name="AppTheme\.NoActionBar" parent="Theme\.AppCompat\.Light\.NoActionBar"/);
  assert.match(styles, /name="postSplashScreenTheme">@style\/AppTheme\.NoActionBar</);
  assert.match(styles, /name="android:background">@drawable\/splash</);
  assert.match(styles, /name="windowSplashScreenBackground">@color\/ic_launcher_background</);
  assert.match(styles, /name="windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher</);
  assert.doesNotMatch(styles, /name="postSplashScreenTheme">@style\/AppTheme</);
});

test("committed android copies match native sources and the MainActivity template", () => {
  const nativeDir = path.join(repoRoot, "native", "android");
  const javaDir = javaDirOf(path.join(repoRoot, "android"), packageName);
  const pluginNames = fs
    .readdirSync(nativeDir)
    .filter((name) => name.endsWith(".java") && name !== "MainActivity.java")
    .sort();
  assert.deepEqual(
    fs
      .readdirSync(javaDir)
      .filter((name) => name.endsWith(".java") && name !== "MainActivity.java")
      .sort(),
    pluginNames,
  );
  for (const name of pluginNames) {
    assert.deepEqual(
      fs.readFileSync(path.join(javaDir, name)),
      fs.readFileSync(path.join(nativeDir, name)),
    );
  }
  assert.equal(
    fs.readFileSync(path.join(javaDir, "MainActivity.java"), "utf8"),
    mainActivitySource(packageName),
  );
  assert.deepEqual(
    fs.readFileSync(path.join(repoRoot, "android", "app", "src", "main", "res", "xml", "file_paths.xml")),
    fs.readFileSync(path.join(nativeDir, "file_paths.xml")),
  );
});

test("sync overwrites android copies from native sources and the template", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glossary-native-"));
  const androidRoot = fs.mkdtempSync(path.join(os.tmpdir(), "glossary-android-"));
  const nativeDir = path.join(projectRoot, "native", "android");
  fs.mkdirSync(nativeDir, { recursive: true });
  fs.writeFileSync(path.join(nativeDir, "DemoPlugin.java"), "class Demo {}\n");
  fs.writeFileSync(path.join(nativeDir, "MainActivity.java"), "not the template\n");
  fs.writeFileSync(path.join(nativeDir, "file_paths.xml"), "<paths/>\n");

  const javaDir = javaDirOf(androidRoot, "com.example.demo");
  const xmlDir = path.join(androidRoot, "app", "src", "main", "res", "xml");
  fs.mkdirSync(javaDir, { recursive: true });
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(path.join(javaDir, "DemoPlugin.java"), "hand edited\n");
  fs.writeFileSync(path.join(javaDir, "Extra.java"), "left behind\n");
  fs.writeFileSync(path.join(javaDir, "MainActivity.java"), "old activity\n");
  fs.writeFileSync(path.join(xmlDir, "file_paths.xml"), "old xml\n");

  syncNativeSources({
    projectRoot,
    androidRoot,
    packageName: "com.example.demo",
  });

  assert.equal(fs.readFileSync(path.join(javaDir, "DemoPlugin.java"), "utf8"), "class Demo {}\n");
  assert.equal(fs.existsSync(path.join(javaDir, "Extra.java")), false);
  assert.equal(
    fs.readFileSync(path.join(javaDir, "MainActivity.java"), "utf8"),
    mainActivitySource("com.example.demo"),
  );
  assert.equal(fs.readFileSync(path.join(xmlDir, "file_paths.xml"), "utf8"), "<paths/>\n");
  assert.deepEqual(
    fs.readdirSync(javaDir).sort(),
    ["DemoPlugin.java", "MainActivity.java"],
  );
});
