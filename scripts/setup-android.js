import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const pkg = "com.ql796907.paperglossary";

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function patchMainActivity() {
  const javaDir = path.join(
    androidDir,
    "app",
    "src",
    "main",
    "java",
    ...pkg.split("."),
  );
  fs.mkdirSync(javaDir, { recursive: true });
  fs.copyFileSync(
    path.join(root, "native", "android", "ApkUpdaterPlugin.java"),
    path.join(javaDir, "ApkUpdaterPlugin.java"),
  );
  const main = path.join(javaDir, "MainActivity.java");
  fs.writeFileSync(
    main,
    `package ${pkg};

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(ApkUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`,
    "utf8",
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
  fs.writeFileSync(manifestPath, xml, "utf8");
}

function copyXml() {
  const xmlDir = path.join(androidDir, "app", "src", "main", "res", "xml");
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.copyFileSync(
    path.join(root, "native", "android", "file_paths.xml"),
    path.join(xmlDir, "file_paths.xml"),
  );
}

function ensureKeystore() {
  const propsPath = path.join(androidDir, "keystore.properties");
  const storePath = path.join(androidDir, "glossary.keystore");
  if (!fs.existsSync(storePath)) {
    console.error(`
【换电脑提醒】没有找到 android/glossary.keystore。
这是给手机安装包盖章的钥匙，不在 git 里。
请从旧电脑拷过来（连同 android/keystore.properties），再重新打包。
不要在新电脑上另做一把钥匙，否则已经装过的手机无法更新。
若你确认这是第一次打包、可以新建钥匙，再设环境变量 GLOSSARY_NEW_KEYSTORE=1 后重试。
`);
    if (process.env.GLOSSARY_NEW_KEYSTORE !== "1") process.exit(1);
    run("keytool", [
      "-genkeypair",
      "-v",
      "-keystore",
      `"${storePath}"`,
      "-alias",
      "glossary",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
      "-storepass",
      "paperglossary",
      "-keypass",
      "paperglossary",
      "-dname",
      `"CN=术语本, OU=personal, O=hy, L=Local, ST=NA, C=CN"`,
    ]);
    console.warn("已新建钥匙。请立刻备份 android/glossary.keystore 和 android/keystore.properties。");
  }
  if (!fs.existsSync(propsPath)) {
    fs.writeFileSync(
      propsPath,
      `storeFile=glossary.keystore
storePassword=paperglossary
keyAlias=glossary
keyPassword=paperglossary
`,
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

if (!fs.existsSync(path.join(androidDir, "app"))) {
  run("npx", ["cap", "add", "android"]);
}
run("npx", ["cap", "sync", "android"]);
run("node", [path.join(root, "scripts", "make-icons.js")]);
patchMainActivity();
patchManifest();
copyXml();
ensureKeystore();
patchGradle();
patchVersion();
patchGradleProxy();
writeLocalProperties();
console.log("Android 工程已接好 APK 更新插件。");
