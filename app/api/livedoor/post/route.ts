import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function generateWsseHeader(livedoorId: string, apiKey: string) {
  const nonceBytes = crypto.randomBytes(16);
  // Format Created strictly to YYYY-MM-DDTHH:mm:ssZ without milliseconds as required by legacy systems
  const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  
  const sha1 = crypto.createHash("sha1");
  sha1.update(nonceBytes);
  sha1.update(Buffer.from(created, "utf-8"));
  sha1.update(Buffer.from(apiKey, "utf-8"));
  const passwordDigest = sha1.digest("base64");
  
  const nonceBase64 = nonceBytes.toString("base64");
  
  return `UsernameToken Username="${livedoorId}", PasswordDigest="${passwordDigest}", Nonce="${nonceBase64}", Created="${created}"`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const { livedoorId, blogId, apiKey, title, htmlContent, draft } = await req.json();

    const trimmedLivedoorId = livedoorId ? livedoorId.trim() : "";
    const trimmedApiKey = apiKey ? apiKey.trim() : "";
    const trimmedBlogId = blogId ? blogId.trim() : "";

    if (!trimmedLivedoorId || !trimmedApiKey) {
      return NextResponse.json(
        { success: false, error: "Livedoor ID と API Key が設定されていません。設定画面から設定してください。" },
        { status: 400 }
      );
    }

    if (!title || !htmlContent) {
      return NextResponse.json(
        { success: false, error: "タイトルと本文が不足しています。" },
        { status: 400 }
      );
    }

    const wsseHeader = generateWsseHeader(trimmedLivedoorId, trimmedApiKey);
    let actualBlogId = trimmedBlogId || trimmedLivedoorId;
    
    // If the user accidentally provided their public blog URL (e.g. http://blog.livedoor.jp/username/ or https://username.blog.jp/)
    // Try to extract the blog ID if possible, or just treat it as a URL
    try {
      if (actualBlogId.startsWith("http://") || actualBlogId.startsWith("https://")) {
        const urlObj = new URL(actualBlogId);
        const host = urlObj.hostname;
        
        if (host === "blog.livedoor.jp") {
          const parts = urlObj.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            actualBlogId = parts[0]; // e.g. "username" from "/username/"
          }
        } else if (
          host.endsWith(".livedoor.blog") ||
          host.endsWith(".livedoor.jp") ||
          host.endsWith(".blog.jp") ||
          host.endsWith(".doorblog.jp") ||
          host.endsWith(".publog.jp")
        ) {
          // Extract subdomain (e.g. "xxxx" from "xxxx.livedoor.blog")
          const parts = host.split(".");
          if (parts.length >= 2) {
            actualBlogId = parts[0];
          }
        }
      }
    } catch (e) {
      // Ignore URL parsing errors
    }

    // Construct Atom XML Entry
    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <content type="text/html"><![CDATA[${htmlContent}]]></content>
  <app:control xmlns:app="http://www.w3.org/2007/app">
    <app:draft>${draft ? "yes" : "no"}</app:draft>
  </app:control>
</entry>`;

    // Determine candidate endpoints to try
    const endpoints: string[] = [];

    if (actualBlogId.startsWith("http://") || actualBlogId.startsWith("https://")) {
      // Direct root endpoint URL
      let base = actualBlogId;
      if (base.endsWith("/")) {
        base = base.slice(0, -1);
      }
      if (!base.endsWith("/article")) {
        endpoints.push(`${base}/article`);
      } else {
        endpoints.push(base);
      }
    } else {
      // It's a plain ID (e.g. "roki_review" or "rokireview")
      // 1. Try standard Livedoor blogcms AtomPub HTTPS (Most reliable & recommended)
      endpoints.push(`https://livedoor.blogcms.jp/atom/blog/${actualBlogId}/article`);
      // 2. Try standard Livedoor blogcms AtomPub HTTP (Fallback)
      endpoints.push(`http://livedoor.blogcms.jp/atom/blog/${actualBlogId}/article`);
    }

    let response = null;
    let responseText = "";
    let lastErrorMsg = "";
    let lastStatus = 500;

    for (const url of endpoints) {
      console.log(`Attempting to post to Livedoor API endpoint: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 8000);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "X-WSSE": wsseHeader,
            "Content-Type": "application/xml",
            "Accept": "application/xml",
          },
          body: xmlBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await res.text();
        const contentType = res.headers.get("content-type") || "";
        const trimmedText = text.trim();

        // Check if the response from this endpoint is HTML instead of XML.
        const isHtml = 
          contentType.includes("text/html") ||
          trimmedText.startsWith("<!DOCTYPE") ||
          trimmedText.startsWith("<!doctype") ||
          trimmedText.startsWith("<html") ||
          trimmedText.startsWith("<HTML");

        if (isHtml) {
          console.warn(`Livedoor API endpoint ${url} returned HTML instead of XML.`);
          lastErrorMsg = `ライブドアAPIから無効なレスポンス（HTML等）が返されました。Livedoor ID、ブログID、またはAPIキーが誤っている可能性があります。

【サブブログ（例: ${actualBlogId}）への投稿設定チェック】
1. 「Livedoor ID (ログインID)」には、サブブログのIDではなく、必ずメインブログ（メインアカウント）の「ログインID」を設定してください。
2. 「ブログID」には、投稿先であるサブブログのID（例: ${actualBlogId}）を正確に入力してください。
3. 「API Key」はメインブログと共通であっても、必ず管理画面（ブログ設定 ＞ API設定）の「APIキー」を正しく設定してください。`;
          responseText = text;
          lastStatus = 401;
          break; // Stop immediately to show this detailed configuration error to the user
        }

        if (!res.ok) {
          console.warn(`Livedoor API endpoint ${url} returned error status: ${res.status}`);
          let err = `Livedoor APIエラー (HTTP ${res.status} ${res.statusText})`;
          if (res.status === 401 || res.status === 403) {
            err += ` - 認証に失敗しました。

【サブブログ（例: ${actualBlogId}）への投稿設定チェック】
1. 「Livedoor ID (ログインID)」には、サブブログのIDではなく、必ずメインブログ（メインアカウント）の「ログインID」を設定してください。
2. 「ブログID」には、投稿先であるサブブログ of ID（例: ${actualBlogId}）を正確に入力してください。
3. 「API Key」はメインブログと共通であっても、必ず管理画面（ブログ設定 ＞ API設定）の「APIキー」を正しく設定してください。`;
          }
          if (text.includes("<message>")) {
            const msgMatch = text.match(/<message>([^<]+)<\/message>/);
            if (msgMatch && msgMatch[1]) {
              err += ` (詳細: ${msgMatch[1]})`;
            }
          }
          lastErrorMsg = err;
          responseText = text;
          lastStatus = res.status;
          
          if (res.status === 401 || res.status === 403) {
            break; // Stop immediately on authentication failure to prevent masking the error
          }
          continue; // Try next fallback endpoint (e.g. HTTP instead of HTTPS)
        }

        // Success!
        response = res;
        responseText = text;
        break; // Stop loop on success

      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error(`Livedoor fetch failed for endpoint ${url}:`, fetchError);
        
        const isTimeout = fetchError.name === "AbortError";
        lastErrorMsg = isTimeout 
          ? `ライブドアAPIへの接続がタイムアウトしました (8秒)。ブログID (${actualBlogId}) またはエンドポイントURLが間違っている可能性があります。`
          : `ライブドアAPIへの接続に失敗しました: ${fetchError.message || "ネットワークエラー"}`;
        lastStatus = isTimeout ? 504 : 502;
        continue; // Try next fallback
      }
    }

    if (!response) {
      return NextResponse.json({
        success: false,
        error: lastErrorMsg || "すべてのエンドポイントへの投稿に失敗しました。"
      }, { status: 200 }); // Return HTTP 200 to let client show the clear error message instead of general proxy error.
    }

    // Extract article link from Response XML
    let articleUrl = "";
    const linkMatch = responseText.match(/<link\s+[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || 
                      responseText.match(/href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
    if (linkMatch && linkMatch[1]) {
      articleUrl = linkMatch[1];
    } else {
      // Fallback url template
      articleUrl = `https://blog.livedoor.jp/${livedoorId}/`;
    }

    return NextResponse.json({
      success: true,
      url: articleUrl,
      raw: responseText.substring(0, 1000), // snippet for debug
    });

  } catch (error: any) {
    console.error("Livedoor API post exception:", error);
    return NextResponse.json(
      { success: false, error: `サーバー処理でエラーが発生しました: ${error.message}` },
      { status: 500 }
    );
  }
}
