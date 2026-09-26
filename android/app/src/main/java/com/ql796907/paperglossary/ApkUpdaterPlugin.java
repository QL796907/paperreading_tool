package com.ql796907.paperglossary;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
  @PluginMethod
  public void getVersion(PluginCall call) {
    JSObject ret = new JSObject();
    try {
      var info =
          getContext()
              .getPackageManager()
              .getPackageInfo(getContext().getPackageName(), 0);
      ret.put("version", info.versionName);
      long code =
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
              ? info.getLongVersionCode()
              : info.versionCode;
      ret.put("versionCode", code);
      call.resolve(ret);
    } catch (Exception err) {
      call.reject(err.getMessage());
    }
  }

  @PluginMethod
  public void download(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.isEmpty()) {
      call.reject("缺少下载地址");
      return;
    }
    new Thread(
            () -> {
              HttpURLConnection conn = null;
              try {
                File out = new File(getContext().getCacheDir(), "paper-glossary-update.apk");
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.connect();
                int status = conn.getResponseCode();
                int hops = 0;
                boolean viaMirror = url.startsWith("https://gh.4o.pw/");
                while (status >= 300 && status < 400 && hops < 5) {
                  String next = conn.getHeaderField("Location");
                  conn.disconnect();
                  if (next == null || next.isEmpty()) break;
                  if (viaMirror
                      && !next.startsWith("https://gh.4o.pw/")
                      && (next.startsWith("https://github.com/")
                          || next.contains("githubusercontent.com"))) {
                    next = "https://gh.4o.pw/" + next;
                  }
                  conn = (HttpURLConnection) new URL(next).openConnection();
                  conn.setInstanceFollowRedirects(false);
                  conn.setConnectTimeout(20000);
                  conn.setReadTimeout(60000);
                  conn.connect();
                  status = conn.getResponseCode();
                  hops += 1;
                }
                if (status != 200) {
                  call.reject("下载失败（HTTP " + status + "）");
                  return;
                }
                long total = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream();
                    FileOutputStream fos = new FileOutputStream(out)) {
                  byte[] buf = new byte[8192];
                  long received = 0;
                  int n;
                  long lastEmit = 0;
                  while ((n = in.read(buf)) > 0) {
                    fos.write(buf, 0, n);
                    received += n;
                    if (received - lastEmit > 200000 || received == total) {
                      lastEmit = received;
                      JSObject progress = new JSObject();
                      progress.put("received", received);
                      progress.put("total", total);
                      notifyListeners("progress", progress);
                    }
                  }
                }
                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                call.resolve(ret);
              } catch (Exception err) {
                call.reject(err.getMessage());
              } finally {
                if (conn != null) conn.disconnect();
              }
            })
        .start();
  }

  @PluginMethod
  public void install(PluginCall call) {
    String path = call.getString("path");
    if (path == null) {
      call.reject("没有安装包路径");
      return;
    }
    File apk = new File(path);
    if (!apk.exists()) {
      call.reject("安装包不存在");
      return;
    }
    Activity activity = getActivity();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !activity.getPackageManager().canRequestPackageInstalls()) {
      Intent settings =
          new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
              .setData(Uri.parse("package:" + activity.getPackageName()))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity.startActivity(settings);
      call.reject("请先允许「安装未知应用」，然后再点一次检查更新");
      return;
    }
    Uri uri =
        FileProvider.getUriForFile(
            activity, activity.getPackageName() + ".fileprovider", apk);
    Intent intent =
        new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    activity.startActivity(intent);
    call.resolve();
  }
}
