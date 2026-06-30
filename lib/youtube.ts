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
      videos: recentVideos.slice(0, 10),
      totalViews
    });
  }

  if (trendsResult.length === 0) {
     throw new Error('APIからデータを取得できませんでした。');
  }

  trendsResult.sort((a, b) => {
     return (b.totalViews || 0) - (a.totalViews || 0);
  });
  
  const sortedTrends = trendsResult.slice(0, 10).map((t, i) => ({ ...t, id: i + 1 }));

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
    videos: recentVideos.slice(0, 50),
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

export async function generateSummarySiteClient(youtubeToken: string, geminiToken: string, videoId: string, videoTitle: string) {
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
1.  HTML、CSSを含む1つの完全なHTMLファイルとして出力してください（プレビュー表示用）。
2.  Tailwind CSSをCDN（<script src="https://cdn.tailwindcss.com"></script>）で読み込んでスタイリングしてください。
3.  まとめサイトの構成（ヘッダー、アイキャッチタイトル、スレッド風のレスや吹き出し風のコメント表示、AIによる総評やまとめ）を含めてください。
4.  「元動画へのリンク」として、動画URL: https://www.youtube.com/watch?v=${videoId} を必ず記載してください。
5.  レイアウトは、シンプルで読みやすいブログスタイルで統一してください。
6.  存在しないリンクや、プレースホルダー的な偽のリンク（メニューや外部サイトへのダミーなど）は絶対に含めないでください。動画へのリンク以外は禁止です。
7.  ユーザーが見て楽しめるような、キャッチーでまとまった内容にしてください。
8.  レスポンスはHTMLのコードのみ（\`\`\`html ... \`\`\` は不可、最初から <!DOCTYPE html> で始めてください）にしてください。
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiToken}`;
  
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
    
    throw new Error(`Gemini API呼び出しに失敗しました: ${errorDetail} (APIキーが有効であるか、モデル 'gemini-3.5-flash' が利用可能かご確認ください。)`);
  }

  const data = await response.json();
  let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  html = html.replace(/^```html\n/, '').replace(/\n```$/, '');

  return { success: true, html };
}
