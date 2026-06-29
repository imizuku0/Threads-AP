'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, Hash, ExternalLink, Settings, Activity, AlertCircle, Key, FileText, CheckCircle2, XCircle, Loader2, Youtube, ThumbsUp, MessageSquare, Flame, Sparkles, X, Bookmark, Save, Trash2 } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { fetchYouTubeTrends, fetchYouTubePopularVideos, generateSummarySiteClient } from '@/lib/youtube';

type Trend = {
  id: number;
  topic: string;
  postCount: string;
  category: string;
  isSpiking?: boolean;
  wave?: { time: string; count: number }[];
  videos?: {
    videoId: string;
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl: string;
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    isShort?: boolean;
  }[];
  totalViews?: number;
};

type SavedSummary = {
  id: string;
  title: string;
  html: string;
  createdAt: number;
};

export default function YouTubeTrendsApp() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<string>('');
  const [rawPostCount, setRawPostCount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [expandedTrendId, setExpandedTrendId] = useState<number | null>(null);
  
  // API Authentication State
  const [showSettings, setShowSettings] = useState(false);
  const [inputToken, setInputToken] = useState('');
  const [inputGeminiToken, setInputGeminiToken] = useState('');
  const [inputKeywords, setInputKeywords] = useState('AIツール, ワールドカップ, Next.js, 週末, 映画, アニメ, 料理, キャンプ, ガジェット, 旅行, 筋トレ, 投資');
  
  const [activeToken, setActiveToken] = useState('');
  const [activeGeminiToken, setActiveGeminiToken] = useState('');
  const [activeKeywords, setActiveKeywords] = useState('AIツール, ワールドカップ, Next.js, 週末, 映画, アニメ, 料理, キャンプ, ガジェット, 旅行, 筋トレ, 投資');
  const [videoType, setVideoType] = useState<'all' | 'regular' | 'shorts'>('all');
  const [activeVideoType, setActiveVideoType] = useState<'all' | 'regular' | 'shorts'>('all');
  const [timeRange, setTimeRange] = useState<'all' | 'hour' | 'day' | 'week' | 'month' | 'year'>('all');
  const [activeTimeRange, setActiveTimeRange] = useState<'all' | 'hour' | 'day' | 'week' | 'month' | 'year'>('all');
  const [searchMode, setSearchMode] = useState<'keywords' | 'popular'>('keywords');
  const [activeSearchMode, setActiveSearchMode] = useState<'keywords' | 'popular'>('keywords');
  
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Livedoor Blog State
  const [inputLivedoorId, setInputLivedoorId] = useState('');
  const [inputLivedoorBlogId, setInputLivedoorBlogId] = useState('');
  const [inputLivedoorApiKey, setInputLivedoorApiKey] = useState('');
  const [activeLivedoorId, setActiveLivedoorId] = useState('');
  const [activeLivedoorBlogId, setActiveLivedoorBlogId] = useState('');
  const [activeLivedoorApiKey, setActiveLivedoorApiKey] = useState('');

  const [isPostingToLivedoor, setIsPostingToLivedoor] = useState(false);
  const [livedoorPostTitle, setLivedoorPostTitle] = useState('');
  const [isLivedoorDraft, setIsLivedoorDraft] = useState(true);
  const [livedoorSuccessUrl, setLivedoorSuccessUrl] = useState<string | null>(null);
  const [livedoorError, setLivedoorError] = useState<string | null>(null);

  // Summary generation state
  const [generatingVideoId, setGeneratingVideoId] = useState<string | null>(null);
  const [summaryHtml, setSummaryHtml] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Saved Summaries & Navigation Tabs State
  const [activeTab, setActiveTab] = useState<'trends' | 'saved'>('trends');
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);

  const handleGenerateSummary = async (e: React.MouseEvent, videoId: string, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!activeToken) {
      alert('YouTube APIキーを設定してください。');
      return;
    }

    if (!activeGeminiToken) {
      alert('Gemini APIキーを設定してください。（設定アイコンから入力）');
      return;
    }
    
    setGeneratingVideoId(videoId);
    try {
      const res = await generateSummarySiteClient(activeToken, activeGeminiToken, videoId, title);
      if (res.success && res.html) {
        setSummaryHtml(res.html);
        setLivedoorPostTitle(`${title} 反応まとめ`);
        setCurrentSavedId(null); // Reset saved ID for newly generated summary
        setLivedoorSuccessUrl(null);
        setLivedoorError(null);
        setShowSummaryModal(true);
      } else {
        alert('生成に失敗しました');
      }
    } catch(err: any) {
      alert(err.message || 'エラーが発生しました');
    } finally {
      setGeneratingVideoId(null);
    }
  };

  const handleSaveSummary = () => {
    if (!summaryHtml) return;
    
    const newSummary: SavedSummary = {
      id: currentSavedId || Date.now().toString(),
      title: livedoorPostTitle,
      html: summaryHtml,
      createdAt: currentSavedId 
        ? (savedSummaries.find(item => item.id === currentSavedId)?.createdAt || Date.now())
        : Date.now(),
    };
    
    let updatedList: SavedSummary[] = [];
    if (currentSavedId) {
      updatedList = savedSummaries.map(item => item.id === currentSavedId ? newSummary : item);
    } else {
      updatedList = [newSummary, ...savedSummaries];
      setCurrentSavedId(newSummary.id);
    }
    
    setSavedSummaries(updatedList);
    if (typeof window !== 'undefined') {
      localStorage.setItem('saved_summaries', JSON.stringify(updatedList));
    }
    alert('まとめ記事を保存しました！「保存済みのまとめ」タブからいつでも確認・ブログ投稿できます。');
  };

  const handleDeleteSavedSummary = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('この保存されたまとめを削除しますか？')) {
      return;
    }
    const updatedList = savedSummaries.filter(item => item.id !== id);
    setSavedSummaries(updatedList);
    if (typeof window !== 'undefined') {
      localStorage.setItem('saved_summaries', JSON.stringify(updatedList));
    }
  };

  const handleOpenSavedSummary = (item: SavedSummary) => {
    setSummaryHtml(item.html);
    setLivedoorPostTitle(item.title);
    setCurrentSavedId(item.id);
    setLivedoorSuccessUrl(null);
    setLivedoorError(null);
    setShowSummaryModal(true);
  };

  const handlePostToLivedoor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLivedoorId || !activeLivedoorApiKey) {
      alert("Livedoor ID と API Key を設定画面から入力してください。");
      return;
    }
    if (!livedoorPostTitle) {
      alert("記事タイトルを入力してください。");
      return;
    }
    if (!summaryHtml) {
      alert("投稿するコンテンツがありません。");
      return;
    }

    setIsPostingToLivedoor(true);
    setLivedoorSuccessUrl(null);
    setLivedoorError(null);

    try {
      const response = await fetch("/api/livedoor/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          livedoorId: activeLivedoorId,
          blogId: activeLivedoorBlogId || activeLivedoorId,
          apiKey: activeLivedoorApiKey,
          title: livedoorPostTitle,
          htmlContent: summaryHtml,
          draft: isLivedoorDraft,
        }),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", text);
        if (text.includes("<title>Starting Server...</title>")) {
          throw new Error("開発サーバーが起動中です。数秒待ってから、もう一度「投稿する」ボタンを押してください。");
        }
        const cleanText = text.length > 500 ? text.substring(0, 500) + "..." : text;
        throw new Error(`サーバーから無効なレスポンス（HTML等）が返されました (HTTP ${response.status} ${response.statusText}):\n\n${cleanText}`);
      }

      if (data.success) {
        setLivedoorSuccessUrl(data.url);
      } else {
        setLivedoorError(data.error || "投稿に失敗しました。");
      }
    } catch (err: any) {
      setLivedoorError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsPostingToLivedoor(false);
    }
  };

  const fetchTrends = async (tokenToUse?: string, keywordsToUse?: string, videoTypeToUse?: string, timeRangeToUse?: string, searchModeToUse?: 'keywords' | 'popular') => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const kw = keywordsToUse !== undefined ? keywordsToUse : activeKeywords;
      const vt = videoTypeToUse !== undefined ? videoTypeToUse : activeVideoType;
      const tr = timeRangeToUse !== undefined ? timeRangeToUse : activeTimeRange;
      const token = tokenToUse !== undefined ? tokenToUse : activeToken;
      const mode = searchModeToUse !== undefined ? searchModeToUse : activeSearchMode;
      
      let data;
      if (mode === 'popular') {
        data = await fetchYouTubePopularVideos(token, vt);
      } else {
        data = await fetchYouTubeTrends(token, kw, vt, tr);
      }
      
      setTrends(data.trends || []);
      setDataSource(data.source || 'Unknown');
      setLastUpdated(new Date(data.timestamp || Date.now()));
      setRawPostCount(data.rawPostCount || 0);
      
      if (mode === 'popular' && data.trends && data.trends.length > 0) {
        setExpandedTrendId(data.trends[0].id);
      }
      
      return true;
    } catch (error: any) {
      console.error('Failed to fetch trends:', error);
      setErrorMsg(error.message);
      setDataSource('Error');
      setTrends([]);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('youtube_token') || '';
      const savedGeminiToken = localStorage.getItem('gemini_token') || '';
      const savedLivedoorId = localStorage.getItem('livedoor_id') || '';
      const savedLivedoorBlogId = localStorage.getItem('livedoor_blog_id') || savedLivedoorId;
      const savedLivedoorApiKey = localStorage.getItem('livedoor_api_key') || '';
      const savedSummariesStr = localStorage.getItem('saved_summaries') || '[]';
      
      /* eslint-disable react-hooks/set-state-in-effect */
      if (savedSummariesStr) {
        try {
          setSavedSummaries(JSON.parse(savedSummariesStr));
        } catch (e) {
          console.error('Failed to parse saved summaries:', e);
        }
      }
      if (savedToken) {
        setInputToken(savedToken);
        setActiveToken(savedToken);
      }
      if (savedGeminiToken) {
        setInputGeminiToken(savedGeminiToken);
        setActiveGeminiToken(savedGeminiToken);
      }
      if (savedLivedoorId) {
        setInputLivedoorId(savedLivedoorId);
        setActiveLivedoorId(savedLivedoorId);
      }
      if (savedLivedoorBlogId) {
        setInputLivedoorBlogId(savedLivedoorBlogId);
        setActiveLivedoorBlogId(savedLivedoorBlogId);
      }
      if (savedLivedoorApiKey) {
        setInputLivedoorApiKey(savedLivedoorApiKey);
        setActiveLivedoorApiKey(savedLivedoorApiKey);
      }
      /* eslint-enable react-hooks/set-state-in-effect */

      if (savedToken) {
        fetchTrends(savedToken);
      } else {
        setIsLoading(false);
        setShowSettings(true);
        setErrorMsg('YouTube APIキーが設定されていません。ヘッダーの「設定（ギア）アイコン」からキーを入力してください。');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActiveToken(inputToken);
    setActiveGeminiToken(inputGeminiToken);
    setActiveLivedoorId(inputLivedoorId);
    setActiveLivedoorBlogId(inputLivedoorBlogId);
    setActiveLivedoorApiKey(inputLivedoorApiKey);
    setActiveKeywords(inputKeywords);
    setActiveVideoType(videoType);
    setActiveTimeRange(timeRange);
    setActiveSearchMode(searchMode);
    setConnectionStatus('testing');
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('youtube_token', inputToken);
      localStorage.setItem('gemini_token', inputGeminiToken);
      localStorage.setItem('livedoor_id', inputLivedoorId);
      localStorage.setItem('livedoor_blog_id', inputLivedoorBlogId);
      localStorage.setItem('livedoor_api_key', inputLivedoorApiKey);
    }
    
    const success = await fetchTrends(inputToken, inputKeywords, videoType, timeRange, searchMode);
    if (success) {
      setConnectionStatus('success');
      setTimeout(() => {
        setShowSettings(false);
        setConnectionStatus('idle');
      }, 1500);
    } else {
      setConnectionStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-gray-700">
      <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-800 mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white">
              <Youtube className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">YouTube Trends</h1>
              <p className="text-sm text-gray-500">YouTube Data API 解析エンジン</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              title="API設定"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => fetchTrends()}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              更新
            </button>
          </div>
        </header>

        {/* API Settings Panel */}
        {showSettings && (
          <div className="mb-6 p-5 bg-gray-900/80 border border-gray-800 rounded-2xl animate-in fade-in slide-in-from-top-4">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-400" />
              データ取得元設定
            </h3>
            
            <form onSubmit={handleApplySettings} className="flex flex-col gap-4">
              
              <div className="space-y-3">
                <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300">
                  <strong>YouTube Data API を利用</strong><br/>
                  <code>/youtube/v3/search</code> エンドポイントを使用し、世界中の動画のタイトルや概要欄を検索します。（※ APIキーが必要です。審査不要でGCPから無料で取得可能）
                </div>
                <input
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="YouTube Data API キーを入力"
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
                  disabled={connectionStatus === 'testing'}
                />
              </div>

              <div className="space-y-3 mt-4">
                <div className="p-3 bg-blue-900/30 border border-blue-800/50 rounded-lg text-xs text-blue-300">
                  <strong>Gemini API を利用</strong><br/>
                  動画のトップコメントを分析し、まとめサイト風プレビューを生成するために使用します。（※ 任意。Google AI Studioから無料で取得可能）
                </div>
                <input
                  type="password"
                  value={inputGeminiToken}
                  onChange={(e) => setInputGeminiToken(e.target.value)}
                  placeholder="Gemini API キーを入力 (任意)"
                  className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  disabled={connectionStatus === 'testing'}
                />
              </div>

              <div className="space-y-3 mt-4">
                <div className="p-3 bg-green-950/40 border border-green-800/40 rounded-lg text-xs text-green-300">
                  <strong>ライブドアブログ 投稿設定 (AtomPub API)</strong><br/>
                  作成した反応まとめ記事を、ご自身のライブドアブログにボタンひとつで下書き・公開投稿できます。（「ブログID」の代わりに、お使いの「ルートエンドポイントURL」をそのまま入力しても投稿可能です）
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-semibold ml-1">Livedoor ID (ログインID)</label>
                    <input
                      type="text"
                      value={inputLivedoorId}
                      onChange={(e) => setInputLivedoorId(e.target.value)}
                      placeholder="例: livedoor_user"
                      className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                      disabled={connectionStatus === 'testing'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-semibold ml-1">ブログID（またはルートエンドポイントURL）</label>
                    <input
                      type="text"
                      value={inputLivedoorBlogId}
                      onChange={(e) => setInputLivedoorBlogId(e.target.value)}
                      placeholder="例: roki_review または https://livedoor.blogcms.jp/atompub/roki_review"
                      className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                      disabled={connectionStatus === 'testing'}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-semibold ml-1">API Key（※ログインパスワード不可）</label>
                    <input
                      type="password"
                      value={inputLivedoorApiKey}
                      onChange={(e) => setInputLivedoorApiKey(e.target.value)}
                      placeholder="管理画面から取得したAPI Key"
                      className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all font-mono"
                      disabled={connectionStatus === 'testing'}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 mt-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium ml-1">検索モード</label>
                  <select
                    value={searchMode}
                    onChange={(e) => setSearchMode(e.target.value as any)}
                    className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all appearance-none"
                    disabled={connectionStatus === 'testing'}
                  >
                    <option value="keywords">キーワード検索</option>
                    <option value="popular">急上昇トレンド</option>
                  </select>
                </div>

                {searchMode === 'keywords' && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 font-medium ml-1">監視キーワード (カンマ区切り)</label>
                    <textarea
                      value={inputKeywords}
                      onChange={(e) => setInputKeywords(e.target.value)}
                      placeholder="AIツール, ワールドカップ, Next.js, 週末, 映画, アニメ, 料理..."
                      className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all min-h-[80px]"
                      disabled={connectionStatus === 'testing'}
                    />
                  </div>
                )}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400 font-medium ml-1">動画タイプ</label>
                    <select
                      value={videoType}
                      onChange={(e) => setVideoType(e.target.value as any)}
                      className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all appearance-none"
                      disabled={connectionStatus === 'testing'}
                    >
                      <option value="all">すべて</option>
                      <option value="regular">通常の動画</option>
                      <option value="shorts">ショート動画</option>
                    </select>
                  </div>
                  {searchMode === 'keywords' && (
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400 font-medium ml-1">公開時間</label>
                      <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as any)}
                        className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all appearance-none"
                        disabled={connectionStatus === 'testing'}
                      >
                        <option value="all">過去全て (デフォルト)</option>
                        <option value="hour">過去1時間</option>
                        <option value="day">過去24時間</option>
                        <option value="week">過去1週間</option>
                        <option value="month">過去1ヶ月</option>
                        <option value="year">過去1年</option>
                      </select>
                    </div>
                  )}
                </div>

              <div className="flex justify-end mt-2">
                <button
                  type="submit"
                  disabled={
                    connectionStatus === 'testing' || !inputToken.trim()
                  }
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {connectionStatus === 'testing' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      接続中...
                    </>
                  ) : (
                    '適用して取得'
                  )}
                </button>
              </div>
            </form>
            
            {connectionStatus === 'success' && (
              <div className="mt-3 flex items-center gap-2 text-green-400 text-sm font-medium bg-green-400/10 p-2 rounded-lg border border-green-400/20">
                <CheckCircle2 className="w-4 h-4" />
                APIに正常に接続しました！データを取得しています...
              </div>
            )}
            
            {connectionStatus === 'error' && (
              <div className="mt-4 flex items-center gap-2 text-red-400 text-sm font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                <XCircle className="w-5 h-5 flex-shrink-0" />
                <p>接続に失敗しました。設定を確認してください。</p>
              </div>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 mb-6 gap-2">
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'trends'
                ? 'border-red-500 text-white font-bold'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            トレンド探索・生成
          </button>
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2 relative ${
              activeTab === 'saved'
                ? 'border-red-500 text-white font-bold'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            保存済みのまとめ
            {savedSummaries.length > 0 && (
              <span className="ml-1.5 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {savedSummaries.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'trends' ? (
          <>
            {/* Info Banner */}
        <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-2xl flex gap-3 text-sm text-red-200">
          {activeSearchMode === 'popular' ? (
            <Flame className="w-5 h-5 text-red-400 flex-shrink-0" />
          ) : (
            <Activity className="w-5 h-5 text-red-400 flex-shrink-0" />
          )}
          <div className="space-y-2 flex-1">
            <p className="font-semibold text-red-300 flex items-center justify-between">
              <span>{activeSearchMode === 'popular' ? 'YouTube急上昇トレンド' : 'リアルタイムキーワード解析モード'}</span>
              {rawPostCount > 0 && (
                <span className="text-xs bg-red-900/50 px-2 py-1 rounded-full text-red-300 border border-red-800 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  解析対象: {rawPostCount} videos
                </span>
              )}
            </p>
            <p className="text-red-200/80 leading-relaxed text-xs sm:text-sm">
              {activeSearchMode === 'popular' 
                ? 'YouTube Data APIを利用して、現在日本で急上昇している動画を取得します。直近で最も注目を集めている動画のリストを確認できます。'
                : 'YouTube Data APIを利用して、指定したキーワードに関連する最新動画をドサッと取得します。取得した動画の「公開日時」を分析し、ここ数時間で急激に投稿数が増加しているトピックを波形と共に抽出します。'
              }
            </p>
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="space-y-4 mb-6">
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-2xl flex gap-3 text-sm text-red-200">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-300">エラーが発生しました</p>
                <p className="text-xs text-red-200/80 mt-1 font-mono break-all">{errorMsg}</p>
              </div>
            </div>

            {(errorMsg.toLowerCase().includes('quota') || 
              errorMsg.toLowerCase().includes('limit') || 
              errorMsg.toLowerCase().includes('search queries') || 
              errorMsg.includes('youtube.googleapis.com')) && (
              <div className="p-6 bg-blue-950/20 border border-blue-900/40 rounded-3xl space-y-4 animate-in fade-in zoom-in-95 text-left">
                <div className="flex items-start gap-3">
                  <Key className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-blue-300">
                      YouTube APIのクォータ（1日の利用上限）に達しました
                    </h4>
                    <p className="text-xs text-blue-200/70 mt-1 leading-relaxed">
                      YouTube Data API v3の「動画検索 API」は、1回あたり非常に重いクォータ（100ユニット）を消費します。Google AI Studioがデフォルトで提供しているプロジェクトの共有枠や、現在設定されているテスト用のAPIキーの利用上限を超過したため、このエラーが発生しています。
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-blue-900/20 rounded-2xl border border-blue-800/30 text-xs text-blue-200 space-y-3">
                  <p className="font-bold text-blue-300">💡 解決方法：ご自身の「YouTube Data APIキー」を設定する</p>
                  <p className="leading-relaxed text-[11px]">
                    ご自身のGoogle Cloud Console (無料) で作成したAPIキーを設定することで、1日10,000ユニット（約100回の検索）まで完全に無料で検索可能になります。
                  </p>
                  
                  <div className="space-y-1.5 text-[11px] pl-1">
                    <p className="flex gap-2">
                      <span className="font-bold text-blue-400">1.</span> 
                      <span>
                        <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white inline-flex items-center gap-0.5 font-semibold text-blue-300">
                          Google Cloud Console <ExternalLink className="w-3 h-3 inline" />
                        </a> にログインし、プロジェクトを新規作成します。
                      </span>
                    </p>
                    <p className="flex gap-2">
                      <span className="font-bold text-blue-400">2.</span> 
                      <span>「APIとサービス」＞「ライブラリ」から「<strong>YouTube Data API v3</strong>」を検索し、有効にします。</span>
                    </p>
                    <p className="flex gap-2">
                      <span className="font-bold text-blue-400">3.</span> 
                      <span>「APIとサービス」＞「認証情報」から「認証情報を作成」をクリックして「<strong>APIキー</strong>」を生成します。</span>
                    </p>
                    <p className="flex gap-2">
                      <span className="font-bold text-blue-400">4.</span> 
                      <span>生成されたキーをコピーし、本アプリ右上の <strong className="text-white">「設定 (ギア) ボタン」</strong> から設定して適用してください。</span>
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-full transition-colors shadow-sm"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    今すぐAPIキーを設定する
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trends List */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 gap-2">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> 
              {activeSearchMode === 'popular' ? 'TRENDING VIDEOS' : 'TOP 10 TRENDING KEYWORDS'}
            </span>
            <div className="flex items-center gap-4 text-[11px] sm:text-xs">
              <span className="truncate max-w-[200px] sm:max-w-none">Source: {dataSource}</span>
              <span>最終更新: {lastUpdated ? lastUpdated.toLocaleTimeString('ja-JP') : '...'}</span>
            </div>
          </div>

          <div className="bg-black border border-gray-800 rounded-3xl overflow-hidden divide-y divide-gray-800/50">
            {isLoading ? (
              // Loading Skeletons
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-5 flex items-center gap-4 animate-pulse">
                  <div className="w-6 h-6 bg-gray-800 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-800 rounded w-1/3" />
                    <div className="h-3 bg-gray-800 rounded w-1/4" />
                  </div>
                  <div className="w-24 h-12 bg-gray-800 rounded-lg hidden sm:block" />
                </div>
              ))
            ) : (
              // Actual Data
              trends.map((trend, index) => (
                <div key={trend.id || index} className="group">
                  <div 
                    onClick={() => setExpandedTrendId(expandedTrendId === trend.id ? null : trend.id)}
                    className="p-5 flex items-start sm:items-center gap-4 hover:bg-gray-900/50 transition-colors cursor-pointer"
                  >
                    <div className="text-gray-500 font-mono text-lg font-medium w-6 text-center pt-0.5 sm:pt-0">
                      {index + 1}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-500">{trend.category || '一般'}</span>
                        <span className="text-gray-700 text-xs">•</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${trend.isSpiking ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
                          {trend.isSpiking ? '急上昇中' : '安定'}
                        </span>
                      </div>
                      <h2 className="text-lg font-semibold text-white group-hover:text-red-400 transition-colors flex items-center gap-1 truncate">
                        <Hash className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        <span className="truncate">{trend.topic}</span>
                      </h2>
                      <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                        <span>{trend.postCount}</span>
                        {trend.totalViews !== undefined && (
                          <>
                            <span className="text-gray-700">•</span>
                            <span>合計 {trend.totalViews.toLocaleString()} 回視聴</span>
                          </>
                        )}
                      </p>
                    </div>
                    
                    {/* Trend Wave Chart */}
                    {trend.wave && trend.wave.length > 0 && (
                      <div className="w-24 h-12 sm:w-32 sm:h-14 ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trend.wave}>
                            <defs>
                              <linearGradient id={`gradient-${trend.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={trend.isSpiking ? "#ef4444" : "#3b82f6"} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={trend.isSpiking ? "#ef4444" : "#3b82f6"} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <YAxis hide />
                            <Area 
                              type="monotone" 
                              dataKey="count" 
                              stroke={trend.isSpiking ? "#ef4444" : "#3b82f6"} 
                              strokeWidth={2}
                              fillOpacity={1} 
                              fill={`url(#gradient-${trend.id})`}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="hidden sm:flex ml-4 text-gray-600 group-hover:text-white transition-colors">
                      <span className="text-xs font-medium mr-2">動画を見る</span>
                    </div>
                  </div>
                  
                  {expandedTrendId === trend.id && trend.videos && trend.videos.length > 0 && (
                    <div className="p-5 pt-0 bg-gray-900/30 border-t border-gray-800/50">
                      <h4 className="text-sm font-medium text-gray-400 mb-4 mt-4">関連する最近の動画</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {trend.videos.map((video, idx) => (
                          <div key={idx} className="bg-black border border-gray-800 rounded-lg overflow-hidden hover:border-red-500/50 transition-colors flex flex-col group relative">
                            <a 
                              href={video.isShort ? `https://www.youtube.com/shorts/${video.videoId}` : `https://www.youtube.com/watch?v=${video.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block flex-1"
                            >
                              {video.thumbnailUrl && (
                                <img src={video.thumbnailUrl} alt={video.title} className="w-full aspect-video object-cover" />
                              )}
                              <div className="p-3">
                                <h5 className="text-xs font-medium text-white line-clamp-2 mb-1" title={video.title}>{video.title}</h5>
                                <p className="text-[10px] text-gray-500 mb-2 truncate">
                                  {video.channelTitle}
                                </p>
                                <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                                  {video.viewCount !== undefined && (
                                    <span className="flex items-center gap-1 font-medium">
                                      <Activity className="w-3 h-3" />
                                      {video.viewCount.toLocaleString()}
                                    </span>
                                  )}
                                  {video.likeCount !== undefined && (
                                    <span className="flex items-center gap-1 font-medium">
                                      <ThumbsUp className="w-3 h-3" />
                                      {video.likeCount.toLocaleString()}
                                    </span>
                                  )}
                                  {video.commentCount !== undefined && (
                                    <span className="flex items-center gap-1 font-medium">
                                      <MessageSquare className="w-3 h-3" />
                                      {video.commentCount.toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </a>
                            <div className="p-2 pt-0">
                              <button
                                onClick={(e) => handleGenerateSummary(e, video.videoId, video.title)}
                                disabled={generatingVideoId === video.videoId}
                                className="w-full flex items-center justify-center gap-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
                              >
                                {generatingVideoId === video.videoId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3 text-yellow-400" />
                                )}
                                まとめサイト生成
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 text-right">
                        <a 
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(trend.topic)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                        >
                          YouTubeでさらに検索 <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {!isLoading && trends.length === 0 && !errorMsg && (
              <div className="p-8 text-center text-gray-500 text-sm">
                データが見つかりませんでした。<br/>APIキーを設定して更新してください。
              </div>
            )}
          </div>
        </div>
        </>
        ) : (
          /* Saved Summaries List */
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2 text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-2">
                <Bookmark className="w-4 h-4" /> 
                SAVED SUMMARIES
              </span>
              <span>保存件数: {savedSummaries.length} 件</span>
            </div>

            {savedSummaries.length === 0 ? (
              <div className="p-12 text-center bg-black border border-gray-800 rounded-3xl text-gray-500 space-y-3">
                <Bookmark className="w-10 h-10 mx-auto text-gray-700 stroke-1" />
                <p className="text-sm font-medium">保存されたまとめ記事はありません。</p>
                <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
                  トレンド探索で気になるトピックから「まとめサイト」を生成し、プレビュー画面から保存することができます。保存した記事はいつでも編集してライブドアブログに投稿できます。
                </p>
                <button
                  onClick={() => setActiveTab('trends')}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-xs font-semibold text-white rounded-full transition-colors border border-gray-800"
                >
                  トレンド探索へ戻る
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {savedSummaries.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-5 bg-black border border-gray-800 rounded-3xl hover:border-gray-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono bg-gray-900 text-gray-400 px-2 py-0.5 rounded border border-gray-800">
                          ID: {item.id}
                        </span>
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {new Date(item.createdAt).toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-white group-hover:text-red-400 transition-colors line-clamp-2">
                        {item.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => handleOpenSavedSummary(item)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white text-black hover:bg-gray-200 text-xs font-bold rounded-full transition-colors whitespace-nowrap shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        プレビュー & 投稿
                      </button>
                      <button
                        onClick={(e) => handleDeleteSavedSummary(item.id, e)}
                        className="p-2 bg-gray-900 hover:bg-red-950/40 text-gray-400 hover:text-red-400 rounded-full transition-colors border border-gray-800 hover:border-red-900/30"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Summary HTML Modal */}
      {showSummaryModal && summaryHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-6xl h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                AI生成まとめサイト プレビュー & ライブドアブログ投稿
              </h3>
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Split Body */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
              
              {/* Left Side: Preview iframe */}
              <div className="flex-1 h-full min-h-[40vh] md:min-h-0 bg-gray-100 relative">
                <iframe 
                  srcDoc={summaryHtml}
                  className="w-full h-full border-none"
                  title="Summary Preview"
                />
              </div>

              {/* Right Side: Control Panel (Save & Post) */}
              <div className="w-full md:w-[350px] border-t md:border-t-0 md:border-l border-gray-200 bg-gray-50 flex flex-col overflow-y-auto">
                <div className="p-5 flex-1 flex flex-col space-y-6">
                  
                  {/* Section 1: Save Summary (Always Available) */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-gray-800 flex items-center gap-2 text-sm border-b pb-2 border-gray-200">
                      <Save className="w-4 h-4 text-blue-600" />
                      まとめ記事を保存
                    </h4>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-600">記事タイトル</label>
                      <input
                        type="text"
                        value={livedoorPostTitle}
                        onChange={(e) => setLivedoorPostTitle(e.target.value)}
                        required
                        placeholder="記事のタイトルを入力"
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-medium"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSummary}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {currentSavedId ? '保存内容を更新' : 'このまとめを保存する'}
                    </button>
                    {currentSavedId && (
                      <p className="text-[10px] text-green-600 font-medium text-center">
                        ※ 現在、保存済みのまとめを編集しています。
                      </p>
                    )}
                  </div>

                  {/* Section 2: Post to Livedoor Blog */}
                  <div className="flex-1 flex flex-col pt-4 border-t border-gray-200">
                    <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-3 text-sm border-b pb-2 border-gray-200">
                      <FileText className="w-4 h-4 text-green-600" />
                      ライブドアブログに投稿
                    </h4>

                    {(!activeLivedoorId || !activeLivedoorApiKey) ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                        <p className="font-semibold flex items-center gap-1">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          ブログ設定が必要です
                        </p>
                        <p className="leading-relaxed text-[11px]">
                          まとめサイトをライブドアブログに直接投稿するには、ヘッダーの「設定（ギア）アイコン」から <strong>Livedoor ID</strong> と <strong>API Key</strong> を設定してください。
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handlePostToLivedoor} className="space-y-4 flex-1 flex flex-col justify-between">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-600">公開設定</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setIsLivedoorDraft(true)}
                                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all text-center ${
                                  isLivedoorDraft 
                                    ? 'bg-green-50 border-green-500 text-green-700 font-semibold' 
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                                disabled={isPostingToLivedoor}
                              >
                                下書き保存
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsLivedoorDraft(false)}
                                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all text-center ${
                                  !isLivedoorDraft 
                                    ? 'bg-red-50 border-red-500 text-red-700 font-semibold' 
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                                disabled={isPostingToLivedoor}
                              >
                                直接公開
                              </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">
                              {isLivedoorDraft 
                                ? '※ 安全のため、まずは下書き（非公開）での投稿を推奨します。' 
                                : '※ ブログに直接公開（即時表示）されます。'}
                            </p>
                          </div>

                          {livedoorSuccessUrl && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 space-y-2 animate-in fade-in zoom-in-95">
                              <p className="font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                ブログ投稿に成功しました！
                              </p>
                              <a 
                                href={livedoorSuccessUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors text-center shadow-sm"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                投稿したブログ記事を開く
                              </a>
                            </div>
                          )}

                          {livedoorError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1 animate-in fade-in zoom-in-95">
                              <p className="font-semibold flex items-center gap-1">
                                <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                                エラーが発生しました
                              </p>
                              <p className="leading-relaxed text-[11px] font-mono break-all whitespace-pre-wrap">{livedoorError}</p>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-gray-200 mt-auto">
                          <button
                            type="submit"
                            disabled={isPostingToLivedoor}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-98 disabled:cursor-not-allowed animate-pulse"
                          >
                            {isPostingToLivedoor ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                ブログに送信中...
                              </>
                            ) : (
                              <>
                                <FileText className="w-4 h-4 text-white" />
                                Livedoor ブログへ投稿する
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
