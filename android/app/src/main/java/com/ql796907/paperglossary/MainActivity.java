package com.ql796907.paperglossary;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(ApkUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
