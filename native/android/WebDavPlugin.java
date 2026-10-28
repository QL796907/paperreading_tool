package com.ql796907.paperglossary;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Android 的 HttpURLConnection 只允许 GET/POST/PUT 等少数方法。
 * CapacitorHttp 走那条路，PROPFIND / MKCOL 会直接被拒绝，坚果云「测试连接」就失败。
 * 这里用 OkHttp 发这些方法，并且不跟随跳转。
 * 响应体超过 1MB 会截断，术语本 GET 不走这里；GET/PUT 的跳转由 WebDAV 调用方在 CapacitorHttp 上关掉跟随。
 */
@CapacitorPlugin(name = "WebDav")
public class WebDavPlugin extends Plugin {
  private static final int MAX_BODY = 1024 * 1024;

  // 全插件一个客户端。连接池和调度器挂在客户端上；按请求新建就不会复用，也不会关掉。
  // 阶段超时为 0（不限）。默认 10 秒读超时会比调用方的 timeoutMs 更早断开。
  // 单次时限在 Call.timeout() 上设置。
  private final OkHttpClient client =
      new OkHttpClient.Builder()
          .connectTimeout(0, TimeUnit.MILLISECONDS)
          .readTimeout(0, TimeUnit.MILLISECONDS)
          .writeTimeout(0, TimeUnit.MILLISECONDS)
          // 301/302 若由 OkHttp 跟随，MKCOL 会被改成 GET。跳转交回协议层按原方法重发。
          .followRedirects(false)
          .followSslRedirects(false)
          .build();

  @PluginMethod
  public void request(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.isEmpty()) {
      call.reject("缺少地址");
      return;
    }
    String method = call.getString("method", "GET");
    if (method == null || method.isEmpty()) method = "GET";
    method = method.toUpperCase();
    String body = call.getString("body");
    Integer timeoutBoxed = call.getInt("timeoutMs", 25000);
    int timeout = timeoutBoxed == null ? 25000 : timeoutBoxed;
    JSObject headers = call.getObject("headers", new JSObject());

    Request.Builder builder = new Request.Builder().url(url);
    if (headers != null) {
      Iterator<String> keys = headers.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        if (key == null) continue;
        String value = headers.getString(key);
        if (value != null) builder.header(key, value);
      }
    }

    String contentType = headers == null ? null : headers.getString("Content-Type");
    if (contentType == null && headers != null) contentType = headers.getString("content-type");
    boolean noBody = "GET".equals(method) || "HEAD".equals(method);
    if (noBody) {
      builder.method(method, null);
    } else if (body == null || body.isEmpty()) {
      builder.method(method, RequestBody.create(null, new byte[0]));
    } else {
      MediaType media =
          MediaType.parse(contentType == null ? "application/xml; charset=utf-8" : contentType);
      builder.method(method, RequestBody.create(media, body.getBytes(StandardCharsets.UTF_8)));
    }

    try {
      okhttp3.Call httpCall = client.newCall(builder.build());
      httpCall.timeout().timeout(timeout, TimeUnit.MILLISECONDS);
      try (Response response = httpCall.execute()) {
        JSObject ret = new JSObject();
        ret.put("status", response.code());
        ret.put("text", readBody(response.body()));
        ret.put("headers", flattenHeaders(response.headers()));
        call.resolve(ret);
      }
    } catch (Exception err) {
      call.reject(explain(err));
    }
  }

  private static String readBody(ResponseBody body) throws IOException {
    if (body == null) return "";
    byte[] bytes = body.bytes();
    if (bytes.length > MAX_BODY) {
      byte[] cut = new byte[MAX_BODY];
      System.arraycopy(bytes, 0, cut, 0, MAX_BODY);
      bytes = cut;
    }
    return new String(bytes, StandardCharsets.UTF_8);
  }

  private static JSObject flattenHeaders(Headers headers) {
    JSObject out = new JSObject();
    for (String name : headers.names()) {
      if (name == null) continue;
      out.put(name.toLowerCase(), headers.get(name));
    }
    return out;
  }

  private static String explain(Exception err) {
    if (err instanceof UnknownHostException) return "连不上坚果云，请检查网络";
    // Call.timeout() 到期是 InterruptedIOException，文案与原来的读超时一致。
    if (err instanceof InterruptedIOException) return "连接超时，请检查网络";
    String msg = err.getMessage();
    if (msg == null || msg.trim().isEmpty()) return "网络请求失败";
    return msg;
  }
}
