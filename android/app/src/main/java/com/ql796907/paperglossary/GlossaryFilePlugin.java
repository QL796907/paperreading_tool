package com.ql796907.paperglossary;

import android.system.ErrnoException;
import android.system.Os;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * 把 Directory.Data 里的临时 JSON 换成正式文件。
 * 只做一次同目录 Os.rename（rename(2)），已有目标会被原子换掉。
 * Capacitor 6 的 Filesystem.rename 在 Android 上先 delete 再 File.renameTo。
 * File.renameTo 遇到已有文件不会覆盖，所以它先删；删完到改名之间进程被杀掉，
 * terms.json 就没了，load() 和同步都读不了。
 */
@CapacitorPlugin(name = "GlossaryFile")
public class GlossaryFilePlugin extends Plugin {
  @PluginMethod
  public void replace(PluginCall call) {
    String from = call.getString("from");
    String to = call.getString("to");
    if (!isBareName(from) || !isBareName(to) || from.equals(to)) {
      call.reject("路径不合法");
      return;
    }

    File dir = getContext().getFilesDir();
    File fromFile = new File(dir, from);
    File toFile = new File(dir, to);
    if (!dir.equals(fromFile.getParentFile()) || !dir.equals(toFile.getParentFile())) {
      call.reject("只能在同一目录里替换");
      return;
    }
    if (!fromFile.isFile()) {
      call.reject("临时文件不存在");
      return;
    }

    try {
      Os.rename(fromFile.getAbsolutePath(), toFile.getAbsolutePath());
      call.resolve();
    } catch (ErrnoException err) {
      String detail = err.getMessage();
      String message =
          detail == null || detail.isEmpty() ? "替换词条文件失败" : "替换词条文件失败：" + detail;
      call.reject(message, err);
    }
  }

  private static boolean isBareName(String name) {
    if (name == null || name.isEmpty() || name.length() > 255) return false;
    if (name.charAt(0) == '.') return false;
    for (int i = 0; i < name.length(); i++) {
      char c = name.charAt(i);
      if (c == '/' || c == '\\' || c == '\0') return false;
    }
    return true;
  }
}
