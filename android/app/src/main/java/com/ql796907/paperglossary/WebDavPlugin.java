package com.ql796907.paperglossary;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.net.SocketTimeoutException;
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
 * 这里用 OkHttp 发任意方法。
 */
@CapacitorPlugin(name = "WebDav")
public class WebDavPlugin extends Plugin {
  private static final int MAX_BODY = 1024 * 1024;

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

    OkHttpClient client =
        new OkHttpClient.Builder()
            .connectTimeout(timeout, TimeUnit.MILLISECONDS)
            .readTimeout(timeout, TimeUnit.MILLISECONDS)
            .writeTimeout(timeout, TimeUnit.MILLISECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build();

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

    try (Response response = client.newCall(builder.build()).execute()) {
      JSObject ret = new JSObject();
      ret.put("status", response.code());
      ret.put("text", readBody(response.body()));
      ret.put("headers", flattenHeaders(response.headers()));
      call.resolve(ret);
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
    if (err instanceof SocketTimeoutException) return "连接超时，请检查网络";
    String msg = err.getMessage();
    if (msg == null || msg.trim().isEmpty()) return "网络请求失败";
    return msg;
  }
}
