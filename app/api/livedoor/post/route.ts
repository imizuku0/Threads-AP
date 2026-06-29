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
        if (urlObj.hostname === "blog.livedoor.jp") {
          const parts = urlObj.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            actualBlogId = parts[0]; // e.g. "username" from "/username/"
          }
        } else if (urlObj.hostname.endsWith(".blog.jp")) {
          actualBlogId = urlObj.hostname.replace(".blog.jp", "");
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
      // 2. Try standard Livedoor blogcms AtomPub HTTP
      endpoints.push(`http://livedoor.blogcms.jp/atom/blog/${actualBlogId}/article`);
      // 3. Try standard Livedoor write API HTTPS
      endpoints.push(`https://write.blog.livedoor.com/api/atom/blog/${actualBlogId}/article`);
      // 4. Try standard Livedoor write API HTTP
      endpoints.push(`http://write.blog.livedoor.com/api/atom/blog/${actualBlogId}/article`);
    }

    let response = null;
    let responseText = "";
    let lastErrorMsg = "";
    let lastStatus = 500;

    for (const url of endpoints) {
      console.log(`Attempting to post to Livedoor API endpoint: ${url}`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "X-WSSE": wsseHeader,
            "Content-Type": "application/xml",
            "Accept": "application/xml",
          },
          body: xmlBody,
        });

        const text = await res.text();
        const contentType = res.headers.get("content-type") || "";
        const trimmedText = text.trim();

        // Check if the response from this endpoint is HTML instead of XML.
        // We check the Content-Type header and verify if the response body actually starts with an HTML structure.
        // This avoids false positives from HTML inside the CDATA section of a successful Atom XML response.
        const isHtml = 
          contentType.includes("text/html") ||
          trimmedText.startsWith("<!DOCTYPE") ||
          trimmedText.startsWith("<!doctype") ||
          trimmedText.startsWith("<html") ||
          trimmedText.startsWith("<HTML");

        if (isHtml) {
          console.warn(`Livedoor API endpoint ${url} returned HTML instead of XML.`);
          lastErrorMsg = "ライブドアAPIから無効なレスポンス（HTML）が返されました。Livedoor ID、ブログID、または API Key が間違っているか、ブログ設定で「外部投稿API（AtomPub）」が有効になっているかを確認してください。";
          responseText = text;
          lastStatus = 401;
          continue; // Try next fallback
        }

        if (!res.ok) {
          console.warn(`Livedoor API endpoint ${url} returned error status: ${res.status}`);
          let err = `Livedoor APIエラー (HTTP ${res.status} ${res.statusText})`;
          if (res.status === 401 || res.status === 403) {
            err += " - 認証に失敗しました。Livedoor ID、API Key（ブログ設定＞外部投稿APIから取得したもの）、または外部投稿設定が「利用する」になっているか確認してください。";
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
          continue; // Try next fallback
        }

        // Success!
        response = res;
        responseText = text;
        break; // Stop loop on success

      } catch (fetchError: any) {
        console.error(`Livedoor fetch failed for endpoint ${url}:`, fetchError);
        lastErrorMsg = `ライブドアAPIへの接続に失敗しました: ${fetchError.message || "ネットワークエラー"}`;
        lastStatus = 502;
        continue; // Try next fallback
      }
    }

    if (!response) {
      return NextResponse.json({
        success: false,
        error: lastErrorMsg || "すべてのエンドポイントへの投稿に失敗しました。"
      }, { status: lastStatus });
    }

    // Extract article link from Response XML
    // Example: <link rel="alternate" type="text/html" href="http://blog.livedoor.jp/username/archives/12345.html"/>
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
