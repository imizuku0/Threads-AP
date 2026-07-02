export function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  return h * 3600 + m * 60 + s;
}

export async function fetchYouTubeTrends(
  token: string, 
  keywordsParam: string, 
  videoType: string, 
  timeRange: string
) {
  const keywords = keywordsParam 
    ? keywordsParam.split(',').map(k => k.trim()).filter(Boolean) 
    : ['AIツール', 'ワールドカップ', 'Next.js', '週末'];

  if (!token) {
    throw new Error('YouTube APIキーが必要です。');
  }

  const now = Date.now();
  let publishedAfter = '';
  
  switch (timeRange) {
    case 'hour': publishedAfter = new Date(now - 1 * 60 * 60 * 1000).toISOString(); break;
    case 'day': publishedAfter = new Date(now - 24 * 60 * 60 * 1000).toISOString(); break;
    case 'week': publishedAfter = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(); break;
    case 'month': publishedAfter = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(); break;
    case 'year': publishedAfter = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(); break;
    case 'all': default: publishedAfter = ''; break;
  }
  
  let totalPosts = 0;
  const trendsResult = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    
    let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&regionCode=JP&relevanceLanguage=ja&q=${encodeURIComponent(keyword)}&key=${token}&maxResults=50`;
    
    if (publishedAfter) {
      searchUrl += `&publishedAfter=${encodeURIComponent(publishedAfter)}`;
    }
    
    if (videoType === 'shorts') {
      searchUrl += `&videoDuration=short`;
    }

    const response = await fetch(searchUrl);
    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error(`APIレスポンスのパースに失敗しました: ${response.status} ${response.statusText}`);
    }

    if (!response.ok || data.error) {
      const errorMsg = data.error?.message || data.error || `${response.status} ${response.statusText}`;
      console.warn(`Error fetching ${keyword}:`, errorMsg);
      throw new Error(`[${keyword} の検索エラー]: ${errorMsg}`);
    }

    const posts = data.items || [];
    const videoIdsToFetch = posts.map((p: any) => p.id?.videoId).filter(Boolean);
    let detailedVideos: any[] = [];
    
    if (videoIdsToFetch.length > 0) {
      try {
        const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIdsToFetch.join(',')}&key=${token}`;
        const videosResponse = await fetch(videosUrl);
        const videosData = await videosResponse.json();
        
        if (videosData.items) {
          detailedVideos = videosData.items;
        }
      } catch (e) {
        console.warn(`Failed to fetch video statistics for ${keyword}:`, e);
      }
    }
    
    const filteredVideos = detailedVideos.filter(v => {
      const durationSec = parseDuration(v.contentDetails?.duration || '');
      const isShort = durationSec <= 60;
      if (videoType === 'shorts' && !isShort) return false;
      if (videoType === 'regular' && isShort) return false;
      return true;
    });

    totalPosts += filteredVideos.length;
    
    const history = [0, 0, 0, 0, 0, 0]; 
    const recentVideos: any[] = [];
    
    const oldestTime = filteredVideos.length > 0 
      ? Math.min(...filteredVideos.map(v => new Date(v.snippet?.publishedAt).getTime()))
      : now - 5 * 60 * 60 * 1000;
    
    let timeRangeMs = now - oldestTime;
    if (timeRangeMs < 60 * 60 * 1000) timeRangeMs = 60 * 60 * 1000; // at least 1 hr
    const bucketSizeMs = timeRangeMs / 6;

    filteredVideos.forEach((v: any) => {
      const postTime = new Date(v.snippet?.publishedAt).getTime();
      const msAgo = now - postTime;
      
      let bucketIndex = 5 - Math.floor(msAgo / bucketSizeMs);
      if (bucketIndex < 0) bucketIndex = 0;
      if (bucketIndex > 5) bucketIndex = 5;
      
      history[bucketIndex] += 1;
      
      const durationSec = parseDuration(v.contentDetails?.duration || '');
      
      recentVideos.push({
        videoId: v.id,
        title: v.snippet?.title,
        channelTitle: v.snippet?.channelTitle,
        publishedAt: v.snippet?.publishedAt,
        thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url,
        viewCount: parseInt(v.statistics?.viewCount || '0', 10),
        likeCount: parseInt(v.statistics?.likeCount || '0', 10),
        commentCount: parseInt(v.statistics?.commentCount || '0', 10),
        isShort: durationSec <= 60
      });
    });
    
    // 再生数で降順にソート
    recentVideos.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

    const totalMentions = history.reduce((a, b) => a + b, 0);
    const recentCount = history[4] + history[5];
    const pastCount = history[0] + history[1] + history[2] + history[3];
    const isSpiking = recentCount > (pastCount / 4) * 2 * 1.5 && recentCount > 0;

    // Wave labels based on time range
    const formatLabel = (idx: number) => {
      if (idx === 5) return '現在';
      const msAgo = bucketSizeMs * (5 - idx);
      if (msAgo < 60 * 60 * 1000) return `${Math.round(msAgo / 60000)}m前`;
      if (msAgo < 24 * 60 * 60 * 1000) return `${Math.round(msAgo / 3600000)}h前`;
      return `${Math.round(msAgo / 86400000)}d前`;
    };

    const wave = history.map((count, idx) => ({
      time: formatLabel(idx),
      count: count
    }));

    const totalViews = recentVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0);

    trendsResult.push({
      id: 0, 
      topic: keyword,
      postCount: `${totalMentions} videos`,
      category: 'キーワード/トピック',
      isSpiking,
      wave,
      videos: recentVideos.slice(0, 20),
      totalViews
    });
  }

  if (trendsResult.length === 0) {
     throw new Error('APIからデータを取得できませんでした。');
  }

  trendsResult.sort((a, b) => {
     return (b.totalViews || 0) - (a.totalViews || 0);
  });
  
  const sortedTrends = trendsResult.slice(0, 20).map((t, i) => ({ ...t, id: i + 1 }));

  return {
    success: true,
    source: 'YouTube Data API v3',
    timestamp: new Date().toISOString(),
    trends: sortedTrends,
    rawPostCount: totalPosts
  };
}

export async function fetchYouTubePopularVideos(token: string, videoType: string) {
  if (!token) {
    throw new Error('YouTube APIキーが必要です。');
  }

  let videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=JP&maxResults=50&key=${token}`;

  const response = await fetch(videosUrl);
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`APIレスポンスのパースに失敗しました: ${response.status} ${response.statusText}`);
  }

  if (!response.ok || data.error) {
    const errorMsg = data.error?.message || data.error || `${response.status} ${response.statusText}`;
    throw new Error(`[急上昇検索エラー]: ${errorMsg}`);
  }

  const items = data.items || [];
  
  const filteredVideos = items.filter((v: any) => {
    const durationSec = parseDuration(v.contentDetails?.duration || '');
    const isShort = durationSec <= 60;
    if (videoType === 'shorts' && !isShort) return false;
    if (videoType === 'regular' && isShort) return false;
    return true;
  });

  const recentVideos: any[] = filteredVideos.map((v: any) => {
    const durationSec = parseDuration(v.contentDetails?.duration || '');
    return {
      videoId: v.id,
      title: v.snippet?.title,
      channelTitle: v.snippet?.channelTitle,
      publishedAt: v.snippet?.publishedAt,
      thumbnailUrl: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url,
      viewCount: parseInt(v.statistics?.viewCount || '0', 10),
      likeCount: parseInt(v.statistics?.likeCount || '0', 10),
      commentCount: parseInt(v.statistics?.commentCount || '0', 10),
      isShort: durationSec <= 60
    };
  });

  // 再生数で降順にソート
  recentVideos.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  
  const totalViews = recentVideos.reduce((sum, v) => sum + (v.viewCount || 0), 0);

  // 一つのトレンドとして返す
  const trendsResult = [{
    id: 1,
    topic: '急上昇トレンド',
    postCount: `${recentVideos.length} videos`,
    category: 'YouTube急上昇',
    isSpiking: true,
    wave: [], // グラフは表示しない
    videos: recentVideos.slice(0, 20),
    totalViews
  }];

  return {
    success: true,
    source: 'YouTube Data API v3 (mostPopular)',
    timestamp: new Date().toISOString(),
    trends: trendsResult,
    rawPostCount: filteredVideos.length
  };
}

export async function fetchYouTubeComments(token: string, videoId: string, maxResults: number = 50) {
  if (!token) {
    throw new Error('YouTube APIキーが必要です。');
  }

  const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&order=relevance&maxResults=${maxResults}&key=${token}`;

  const response = await fetch(commentsUrl);
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`APIレスポンスのパースに失敗しました: ${response.status} ${response.statusText}`);
  }

  if (!response.ok || data.error) {
    if (data.error && data.error.reason === 'commentsDisabled') {
      return [];
    }
    const errorMsg = data.error?.message || data.error || `${response.status} ${response.statusText}`;
    throw new Error(`[コメント取得エラー]: ${errorMsg}`);
  }

  const items = data.items || [];
  
  const comments = items.map((item: any) => {
    const snippet = item.snippet?.topLevelComment?.snippet;
    return {
      authorDisplayName: snippet?.authorDisplayName,
      textDisplay: snippet?.textDisplay,
      textOriginal: snippet?.textOriginal,
      likeCount: snippet?.likeCount || 0,
      publishedAt: snippet?.publishedAt
    };
  });

  return comments;
}

export function addYoutubeTimestampLinks(html: string, videoId: string): string {
  // HTMLタグとテキストノードを分割する正規表現
  const parts = html.split(/(<[^>]+>)/g);
  
  // タイムスタンプ（HH:MM:SS または MM:SS）にマッチする正規表現
  // 例: 1:23:45, 01:23:45, 12:34, 1:23
  // 誤判定を防ぐため、前後のコロン、スラッシュ、数字に囲まれていないことを条件にする
  const timestampRegex = /(?<![:/0-9])(\d{1,2}):([0-5]\d)(?::([0-5]\d))?(?![:0-9])/g;

  return parts.map(part => {
    // もしタグであればそのまま返す
    if (part.startsWith('<')) {
      return part;
    }
    
    // タグ以外（テキストノード）であれば、タイムスタンプをリンクに置換
    return part.replace(timestampRegex, (match, p1, p2, p3) => {
      let hours = 0;
      let minutes = 0;
      let seconds = 0;
      
      if (p3 !== undefined) {
        // HH:MM:SS 形式
        hours = parseInt(p1, 10);
        minutes = parseInt(p2, 10);
        seconds = parseInt(p3, 10);
      } else {
        // MM:SS 形式
        minutes = parseInt(p1, 10);
        seconds = parseInt(p2, 10);
      }
      
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      const link = `https://www.youtube.com/watch?v=${videoId}&t=${totalSeconds}`;
      
      return `<a href="${link}" target="_blank" rel="noopener noreferrer" class="yt-timestamp-link" style="color: #1e90ff; text-decoration: underline; font-weight: 500; margin: 0 2px;">${match}</a>`;
    });
  }).join('');
}

export async function generateSummarySiteClient(youtubeToken: string, geminiToken: string, videoId: string, videoTitle: string, model: string = 'gemini-3.5-flash') {
  if (!geminiToken) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const comments = await fetchYouTubeComments(youtubeToken, videoId, 50);
  
  if (!comments || comments.length === 0) {
    throw new Error('コメントが見つかりませんでした。コメントが無効になっているか、まだコメントがありません。');
  }

  const prompt = `
以下のYouTube動画のタイトルと、その動画についたいいね数の多いトップコメントリストを分析し、「まとめサイト（2ch風、またはトレンドブログ風）」のHTMLを生成してください。

動画タイトル: ${videoTitle}
動画URL: https://www.youtube.com/watch?v=${videoId}

コメントリスト (形式: [いいね数] ユーザー名: コメント):
${comments.map((c: any) => `[${c.likeCount}いいね] ${c.authorDisplayName}: ${c.textOriginal}`).join('\n')}

要件:
1. HTML構造とCSSスタイルを明確に分離してください。
2. HTMLはセマンティックな構造（header, main, article, footerなど）で記述し、デザイン用のクラス名は内容を表すもの（例: summary-container, comment-item）にしてください。
3. スタイルは全て <style> タグ内にCSSとして記述してください。デザイン変更がCSSのみで完結するように、CSS変数（Custom Properties）を積極的に活用し、配色やレイアウトを管理してください。
4. Tailwind CSSは使用せず、純粋なCSS（Vanilla CSS）のみでスタイリングしてください。また、ブログ（ライブドアブログ等）の既存のレイアウトを崩さないように、 \`*\` や \`body\`、\`html\` などのグローバルリセットや全体へのスタイル適用は絶対に行わず、生成するコンポーネント固有のクラス名（例: \`.summary-wrapper\` など）に対してのみスタイルを適用してください。
5. 「元動画へのリンク」として、動画URL: https://www.youtube.com/watch?v=${videoId} をサムネイル画像（画像URL: https://img.youtube.com/vi/${videoId}/hqdefault.jpg または maxresdefault.jpg）を使ったクリック可能な画像リンクとして必ず記載してください。テキストリンクだけでなく、記事内でサムネイル画像が大きく表示されるようにしてください。
6. コメントや動画内容から、特定のシーン（例: 「1:23」や「12:34」、「1:02:03」などのタイムスタンプ）への言及がある場合は、積極的にタイムスタンプのテキスト（形式:「MM:SS」または「HH:MM:SS」）をそのまま記載してください。タイムスタンプは後段で自動的に再生リンクへ変換されるため、余計なHTMLリンクタグは付けず、純粋なテキスト形式（例：1:23 や 12:34）で書いてください。
7. レイアウトは、シンプルで読みやすいブログスタイルで統一してください。
8. 存在しないリンクや、プレースホルダー的な偽のリンクは絶対に含めないでください。動画へのリンク以外は禁止です。
9. ユーザーが見て楽しめるような、キャッチーでまとまった内容にしてください。
10. 生成するまとめサイトのテキスト内に「AI」という単語は一切含めないでください。人間が作成したかのような自然なまとめサイトにしてください。
11. 生成するまとめサイトの最下部に、コピーライト表記として「© ホロライブまとめ速報V」または「© 2026 ホロライブまとめ速報V」と書かれた、シンプルで洗練されたフッター（\`.summary-footer\` など）を必ず設けてください。文字は小さく、目立ちすぎないグレーなどの配色でセンタリングしてください。
12. レスポンスはHTMLのコードのみ（\`\`\`html ... \`\`\` は不可）とし、ブログの投稿欄にそのまま貼り付けられるように \`<!DOCTYPE html>\` や \`<html>\`、\`<body>\` タグは含めず、全体のラッパーとなる \`<div>\` タグ（例: \`<div class="summary-wrapper">\`）から始めてください。
`;

  const modelName = model || 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiToken}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  });

  if (!response.ok) {
    let err: any = {};
    try {
      err = await response.json();
    } catch(e) {}
    const errorDetail = err.error?.message || `${response.status} ${response.statusText}`;
    
    // Permission denied or 403 usually means the API key is invalid or they mixed up their YouTube key with Gemini key
    if (response.status === 403 || errorDetail.toLowerCase().includes('permission') || errorDetail.toLowerCase().includes('denied') || errorDetail.toLowerCase().includes('key')) {
      throw new Error(`Gemini API呼び出しに失敗しました: ${errorDetail}\n\n【原因の可能性】\n1. 入力したAPIキーが「Gemini APIキー」ではなく「YouTube APIキー」になっている可能性があります。別々に取得して入力してください。\n2. Gemini APIキーにアクセス制限（IP制限やリファラー制限など）がかかっている可能性があります。\n3. Google AI Studioで新しいAPIキーを作成してお試しください。`);
    }
    
    throw new Error(`Gemini API呼び出しに失敗しました: ${errorDetail} (APIキーが有効であるか、モデル '${modelName}' が利用可能かご確認ください。)`);
  }

  const data = await response.json();
  let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  html = html.replace(/^```html\n/, '').replace(/\n```$/, '');

  // タイムスタンプリンクを自動付与
  html = addYoutubeTimestampLinks(html, videoId);

  return { success: true, html };
}
