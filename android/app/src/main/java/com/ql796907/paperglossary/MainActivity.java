package com.ql796907.paperglossary;

import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    // postSplashScreenTheme 只在 super.onCreate 之前安装才会套上。
    SplashScreen.installSplashScreen(this);
    registerPlugin(ApkUpdaterPlugin.class);
    registerPlugin(WebDavPlugin.class);
    registerPlugin(GlossaryFilePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
