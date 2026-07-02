use base64::{Engine as _, engine::general_purpose::STANDARD};
use sha1::{Sha1, Digest};
use rand::Rng;
use chrono::Utc;

fn generate_wsse_header(livedoor_id: &str, api_key: &str) -> String {
    let mut nonce_bytes = [0u8; 16];
    rand::thread_rng().fill(&mut nonce_bytes);
    
    let created = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    
    let mut hasher = Sha1::new();
    hasher.update(&nonce_bytes);
    hasher.update(created.as_bytes());
    hasher.update(api_key.as_bytes());
    let digest_bytes = hasher.finalize();
    
    let password_digest = STANDARD.encode(&digest_bytes);
    let nonce_base64 = STANDARD.encode(&nonce_bytes);
    
    format!(
        r#"UsernameToken Username="{}", PasswordDigest="{}", Nonce="{}", Created="{}""#,
        livedoor_id, password_digest, nonce_base64, created
    )
}

fn escape_xml(unsafe_str: &str) -> String {
    unsafe_str.chars().map(|c| match c {
        '<' => "&lt;".to_string(),
        '>' => "&gt;".to_string(),
        '&' => "&amp;".to_string(),
        '\'' => "&apos;".to_string(),
        '"' => "&quot;".to_string(),
        _ => c.to_string(),
    }).collect()
}

#[tauri::command]
async fn post_to_livedoor_rust(
    livedoor_id: String,
    blog_id: String,
    api_key: String,
    title: String,
    html_content: String,
    draft: bool,
) -> Result<serde_json::Value, String> {
    let trimmed_livedoor_id = livedoor_id.trim();
    let trimmed_api_key = api_key.trim();
    let trimmed_blog_id = blog_id.trim();

    if trimmed_livedoor_id.is_empty() || trimmed_api_key.is_empty() {
        return Err("Livedoor ID と API Key が設定されていません。設定画面から設定してください。".to_string());
    }

    if title.is_empty() || html_content.is_empty() {
        return Err("タイトルと本文が不足しています。".to_string());
    }

    let mut actual_blog_id = if trimmed_blog_id.is_empty() {
        trimmed_livedoor_id.to_string()
    } else {
        trimmed_blog_id.to_string()
    };

    if actual_blog_id.starts_with("http://") || actual_blog_id.starts_with("https://") {
        if let Ok(parsed_url) = url::Url::parse(&actual_blog_id) {
            if parsed_url.host_str() == Some("blog.livedoor.jp") {
                let parts: Vec<&str> = parsed_url.path().split('/').filter(|s| !s.is_empty()).collect();
                if !parts.is_empty() {
                    actual_blog_id = parts[0].to_string();
                }
            } else if let Some(host) = parsed_url.host_str() {
                if host.ends_with(".blog.jp") {
                    actual_blog_id = host.replace(".blog.jp", "");
                }
            }
        }
    }

    let mut endpoints = Vec::new();

    if actual_blog_id.starts_with("http://") || actual_blog_id.starts_with("https://") {
        let mut base = actual_blog_id.clone();
        if base.ends_with('/') {
            base.pop();
        }
        if !base.ends_with("/article") {
            endpoints.push(format!("{}/article", base));
        } else {
            endpoints.push(base);
        }
    } else {
        endpoints.push(format!("https://livedoor.blogcms.jp/atom/blog/{}/article", actual_blog_id));
        endpoints.push(format!("http://livedoor.blogcms.jp/atom/blog/{}/article", actual_blog_id));
        endpoints.push(format!("https://write.blog.livedoor.com/api/atom/blog/{}/article", actual_blog_id));
        endpoints.push(format!("http://write.blog.livedoor.com/api/atom/blog/{}/article", actual_blog_id));
    }

    let draft_str = if draft { "yes" } else { "no" };
    let xml_body = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom">
  <title>{}</title>
  <content type="text/html"><![CDATA[{}]]></content>
  <app:control xmlns:app="http://www.w3.org/2007/app">
    <app:draft>{}</app:draft>
  </app:control>
</entry>"#,
        escape_xml(&title),
        html_content,
        draft_str
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTPクライアントの作成に失敗しました: {}", e))?;

    let wsse_header = generate_wsse_header(trimmed_livedoor_id, trimmed_api_key);

    let mut last_error_msg = String::new();
    let mut response_text = String::new();
    let mut success = false;

    for url in &endpoints {
        println!("Attempting to post to Livedoor API endpoint (Rust): {}", url);
        match client.post(url)
            .header("X-WSSE", &wsse_header)
            .header("Content-Type", "application/xml")
            .header("Accept", "application/xml")
            .body(xml_body.clone())
            .send()
            .await 
        {
            Ok(res) => {
                let status = res.status();
                let headers = res.headers().clone();
                let text = res.text().await.unwrap_or_default();
                let trimmed_text = text.trim();
                
                let content_type = headers.get(reqwest::header::CONTENT_TYPE)
                    .and_then(|h| h.to_str().ok())
                    .unwrap_or("");

                let is_html = content_type.contains("text/html")
                    || trimmed_text.starts_with("<!DOCTYPE")
                    || trimmed_text.starts_with("<!doctype")
                    || trimmed_text.starts_with("<html")
                    || trimmed_text.starts_with("<HTML");

                if is_html {
                    last_error_msg = "ライブドアAPIから無効なレスポンス（HTML）が返されました。Livedoor ID、ブログID、または API Key が間違っているか、ブログ設定で「外部投稿API（AtomPub）」が有効になっているかを確認してください。".to_string();
                    response_text = text;
                    continue;
                }

                if !status.is_success() {
                    let mut err = format!("Livedoor APIエラー (HTTP {})", status.as_u16());
                    if status.as_u16() == 401 || status.as_u16() == 403 {
                        err.push_str(" - 認証に失敗しました。Livedoor ID、API Key（ブログ設定＞外部投稿APIから取得したもの）、または外部投稿設定が「利用する」になっているか確認してください。");
                    }
                    if text.contains("<message>") {
                        if let Some(start) = text.find("<message>") {
                            if let Some(end) = text.find("</message>") {
                                if end > start + 9 {
                                    let msg = &text[start + 9..end];
                                    err.push_str(&format!(" (詳細: {})", msg));
                                }
                            }
                        }
                    }
                    last_error_msg = err;
                    response_text = text;
                    continue;
                }

                response_text = text;
                success = true;
                break;
            }
            Err(e) => {
                last_error_msg = format!("ライブドアAPIへの接続に失敗しました: {}", e);
                continue;
            }
        }
    }

    if !success {
        let err_msg = if last_error_msg.is_empty() {
            "すべてのエンドポイントへの投稿に失敗しました。".to_string()
        } else {
            last_error_msg
        };
        return Err(err_msg);
    }

    let mut article_url = String::new();
    
    let re1 = regex::Regex::new(r#"(?i)<link\s+[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']"#).ok();
    let re2 = regex::Regex::new(r#"(?i)<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']"#).ok();
    
    if let Some(caps) = re1.as_ref().and_then(|r| r.captures(&response_text)) {
        article_url = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
    } else if let Some(caps) = re2.as_ref().and_then(|r| r.captures(&response_text)) {
        article_url = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
    }

    if article_url.is_empty() {
        article_url = format!("https://blog.livedoor.jp/{}/", trimmed_livedoor_id);
    }

    Ok(serde_json::json!({
        "success": true,
        "url": article_url,
        "raw": if response_text.len() > 1000 { &response_text[..1000] } else { &response_text },
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![post_to_livedoor_rust])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
