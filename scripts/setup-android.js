import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const pkg = "com.ql796907.paperglossary";

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** MainActivity 的唯一模板。注册哪些插件只改这里。 */
export function mainActivitySource(packageName = pkg) {
  return `package ${packageName};

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(ApkUpdaterPlugin.class);
    registerPlugin(WebDavPlugin.class);
    registerPlugin(GlossaryFilePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`;
}

/**
 * 把 native/android 写成 android/app 里的唯一副本。
 * 插件 Java 和 file_paths.xml 只从 native/android 拷贝；MainActivity.java 只来自上面的模板。
 * 该包目录里多出来的 .java 删掉，避免手改或旧类留下来当第二份源。
 */
export function syncNativeSources({
  projectRoot = root,
  androidRoot = androidDir,
  packageName = pkg,
} = {}) {
  const nativeDir = path.join(projectRoot, "native", "android");
  const pluginNames = fs
    .readdirSync(nativeDir)
    .filter((name) => name.endsWith(".java") && name !== "MainActivity.java");
  const javaDir = path.join(
    androidRoot,
    "app",
    "src",
    "main",
    "java",
    ...packageName.split("."),
  );
  fs.mkdirSync(javaDir, { recursive: true });
  const keep = new Set([...pluginNames, "MainActivity.java"]);
  for (const name of fs.readdirSync(javaDir)) {
    if (name.endsWith(".java") && !keep.has(name)) {
      fs.unlinkSync(path.join(javaDir, name));
    }
  }
  for (const name of pluginNames) {
    fs.copyFileSync(path.join(nativeDir, name), path.join(javaDir, name));
  }
  fs.writeFileSync(
    path.join(javaDir, "MainActivity.java"),
    mainActivitySource(packageName),
    "utf8",
  );

  const xmlDir = path.join(androidRoot, "app", "src", "main", "res", "xml");
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.copyFileSync(
    path.join(nativeDir, "file_paths.xml"),
    path.join(xmlDir, "file_paths.xml"),
  );
}

function patchManifest() {
  const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
  let xml = fs.readFileSync(manifestPath, "utf8");
  if (!xml.includes("REQUEST_INSTALL_PACKAGES")) {
    xml = xml.replace(
      "<application",
      `    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <application`,
    );
  }
  const provider = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${pkg}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>`;
  if (!xml.includes("fileprovider")) {
    xml = xml.replace("</application>", `${provider}\n    </application>`);
  }
  // cap add 的默认清单是 allowBackup=true。自动备份会带走 Directory.Data/settings.json。
  xml = xml.replace(/android:allowBackup="[^"]*"/g, 'android:allowBackup="false"');
  if (!xml.includes("android:allowBackup=")) {
    xml = xml.replace(
      "<application",
      '<application\n        android:allowBackup="false"',
    );
  }
  fs.writeFileSync(manifestPath, xml, "utf8");
}

function keystorePassword() {
  const password = process.env.GLOSSARY_KEYSTORE_PASSWORD;
  if (!password) {
    console.error(`
【钥匙密码】缺少环境变量 GLOSSARY_KEYSTORE_PASSWORD。
新建钥匙，或补写 android/keystore.properties 时，密码必须来自这个环境变量。
脚本里没有默认密码。密码只留在本机的 keystore.properties，不要提交进 git。
`);
    process.exit(1);
  }
  return password;
}

function ensureKeystore() {
  const propsPath = path.join(androidDir, "keystore.properties");
  const storePath = path.join(androidDir, "glossary.keystore");
  let password = "";
  if (!fs.existsSync(storePath)) {
    console.error(`
【换电脑提醒】没有找到 android/glossary.keystore。
这是给手机安装包盖章的钥匙，不在 git 里。
请从旧电脑拷过来（连同 android/keystore.properties），再重新打包。
不要在新电脑上另做一把钥匙，否则已经装过的手机无法更新。
若你确认这是第一次打包、可以新建钥匙，再设环境变量 GLOSSARY_NEW_KEYSTORE=1 和 GLOSSARY_KEYSTORE_PASSWORD 后重试。
`);
    if (process.env.GLOSSARY_NEW_KEYSTORE !== "1") process.exit(1);
    password = keystorePassword();
    // 不走 shell，避免密码被 shell 解释。
    const result = spawnSync(
      "keytool",
      [
        "-genkeypair",
        "-v",
        "-keystore",
        storePath,
        "-alias",
        "glossary",
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-validity",
        "10000",
        "-storepass",
        password,
        "-keypass",
        password,
        "-dname",
        "CN=术语本, OU=personal, O=ql, L=Local, ST=NA, C=CN",
      ],
      { cwd: root, stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.warn("已新建钥匙。请立刻备份 android/glossary.keystore 和 android/keystore.properties。");
  }
  if (!fs.existsSync(propsPath)) {
    if (!password) password = keystorePassword();
    fs.writeFileSync(
      propsPath,
      "storeFile=glossary.keystore\nstorePassword=" +
        password +
        "\nkeyAlias=glossary\nkeyPassword=" +
        password +
        "\n",
      "utf8",
    );
  }
}

function patchGradle() {
  const gradle = path.join(androidDir, "app", "build.gradle");
  let text = fs.readFileSync(gradle, "utf8");
  if (!text.includes("keystore.properties")) {
    text = `def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

${text}`;
  }
  if (!text.includes("signingConfigs")) {
    text = text.replace(
      /android \{/,
      `android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }`,
    );
  }
  if (!text.includes("okhttp3:okhttp")) {
    text = text.replace(
      "implementation project(':capacitor-android')",
      `implementation project(':capacitor-android')
    implementation "com.squareup.okhttp3:okhttp:4.12.0"`,
    );
  }
  if (!text.includes("signingConfigs.release")) {
    text = text.replace(
      "buildTypes {\n        release {",
      "buildTypes {\n        release {\n            signingConfig signingConfigs.release",
    );
  }
  fs.writeFileSync(gradle, text, "utf8");
}

function patchVersion() {
  const gradle = path.join(androidDir, "app", "build.gradle");
  let text = fs.readFileSync(gradle, "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  let versionCode = 1;
  try {
    const androidJson = JSON.parse(
      fs.readFileSync(path.join(root, "updates", "android.json"), "utf8"),
    );
    if (Number.isFinite(Number(androidJson.versionCode))) {
      versionCode = Number(androidJson.versionCode);
    }
  } catch {
    /* default */
  }
  text = text.replace(/versionName "[^"]+"/, `versionName "${pkg.version}"`);
  text = text.replace(/versionCode \d+/, `versionCode ${versionCode}`);
  fs.writeFileSync(gradle, text, "utf8");
}

function patchGradleProxy() {
  const file = path.join(androidDir, "gradle.properties");
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (text.includes("systemProp.https.proxyHost")) return;
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.GLOSSARY_PROXY ||
    "";
  if (!proxy) return;
  let host = "127.0.0.1";
  let port = "10808";
  try {
    const u = new URL(proxy);
    host = u.hostname;
    port = u.port || "10808";
  } catch {
    /* keep default */
  }
  text += `
systemProp.http.proxyHost=${host}
systemProp.http.proxyPort=${port}
systemProp.https.proxyHost=${host}
systemProp.https.proxyPort=${port}
`;
  fs.writeFileSync(file, text, "utf8");
}

function writeLocalProperties() {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
  if (!sdk || !fs.existsSync(sdk)) return;
  const escaped = sdk.replace(/\\/g, "\\\\");
  fs.writeFileSync(
    path.join(androidDir, "local.properties"),
    `sdk.dir=${escaped}\n`,
    "utf8",
  );
}

function main() {
  if (!fs.existsSync(path.join(androidDir, "app"))) {
    run("npx", ["cap", "add", "android"]);
  }
  run("npx", ["cap", "sync", "android"]);
  run("node", [path.join(root, "scripts", "make-icons.js")]);
  syncNativeSources();
  patchManifest();
  ensureKeystore();
  patchGradle();
  patchVersion();
  patchGradleProxy();
  writeLocalProperties();
  console.log("Android 工程已接好 APK 更新插件。");
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  if (process.argv.includes("--sync-sources")) {
    syncNativeSources();
  } else {
    main();
  }
}
