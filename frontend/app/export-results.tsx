'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ExportResultsProps {
  messages: any[];
  logs: string[];
  scrapedText: string;
  downloadId: string;
  isExporting: boolean;
}

export default function ExportResults({ messages, logs, scrapedText, downloadId, isExporting }: ExportResultsProps) {
  const [activeTab, setActiveTab] = useState<'console' | 'content'>('console');
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);

  useEffect(() => {
    if (copyState === 'success' || copyState === 'error') {
      const timer = setTimeout(() => setCopyState('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyState]);

  useEffect(() => {
    if (downloadState === 'success' || downloadState === 'error') {
      const timer = setTimeout(() => setDownloadState('idle'), 2000);
      return () => clearTimeout(timer);
    }
  }, [downloadState]);

  useEffect(() => {
    if (isAutoScroll && logsContainerRef.current && activeTab === 'console') {
      const container = logsContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [logs, isAutoScroll, activeTab]);

  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
      if (isUserScrollingRef.current) {
        if (isAtBottom) {
          setIsAutoScroll(true);
          setShowScrollButton(false);
        } else {
          setIsAutoScroll(false);
          setShowScrollButton(true);
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    const handleWheel = () => {
      isUserScrollingRef.current = true;
      setTimeout(() => { isUserScrollingRef.current = false; }, 100);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
        isUserScrollingRef.current = true;
        setTimeout(() => { isUserScrollingRef.current = false; }, 100);
      }
    };
    container.addEventListener('wheel', handleWheel);
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const scrollToBottom = () => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      setIsAutoScroll(true);
      setShowScrollButton(false);
    }
  };

  const copyToClipboard = async () => {
    if (!scrapedText.trim()) { setCopyState('error'); return; }
    if (copyState === 'copying') return;
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(scrapedText);
      setCopyState('success');
    } catch {
      setCopyState('error');
    }
  };

  const downloadAsFile = async () => {
    if (!downloadId) { setDownloadState('error'); return; }
    if (downloadState === 'downloading') return;
    setDownloadState('downloading');
    try {
      const baseUrl = process.env.NEXT_PUBLIC_DOWNLOAD_URL || 'http://localhost:8000';
      const downloadUrl = `${baseUrl}/download/${downloadId}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloadState('success');
    } catch {
      setDownloadState('error');
    }
  };

  const getLogStyle = (logText: string) => {
    if (logText.includes('Error') || logText.includes('error'))
      return { color: '#f85149', prefix: '[ERROR]', prefixColor: '#f85149' };
    if (logText.includes('Success') || logText.includes('completed'))
      return { color: '#3fb950', prefix: '[SUCCESS]', prefixColor: '#3fb950' };
    if (logText.includes('Warning') || logText.includes('warning'))
      return { color: '#d29922', prefix: '[WARN]', prefixColor: '#d29922' };
    if (logText.includes('Progress') || logText.includes('Set '))
      return { color: '#58a6ff', prefix: '[PROGRESS]', prefixColor: '#58a6ff' };
    if (logText.includes('Starting') || logText.includes('Fetching'))
      return { color: '#f78166', prefix: '[INFO]', prefixColor: '#f78166' };
    return { color: '#c9d1d9', prefix: '[INFO]', prefixColor: '#7d8590' };
  };

  const tabs = [
    { id: 'console' as const, label: 'Console' },
    { id: 'content' as const, label: `Scraped Content (${scrapedText.split('\n').filter(line => line.trim()).length} lines)` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(48, 54, 61, 0.8)',
        borderRadius: 12,
        backgroundColor: 'rgba(13, 17, 23, 0.9)',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{
        display: 'flex',
        flexShrink: 0,
        borderBottom: '1px solid #30363d',
        backgroundColor: '#161b22',
      }}>
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            whileHover={{ backgroundColor: activeTab !== tab.id ? 'rgba(48, 54, 61, 0.5)' : undefined }}
            whileTap={{ scale: 0.98 }}
            style={{
              padding: '14px 24px',
              backgroundColor: activeTab === tab.id ? '#0d1117' : 'transparent',
              color: activeTab === tab.id ? '#c9d1d9' : '#8b949e',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #5865f2' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'border-color 0.2s, color 0.2s',
            }}
          >
            {tab.label}
          </motion.button>
        ))}
      </div>

      <div style={{
        paddingTop: 20,
        paddingRight: 20,
        paddingBottom: 20,
        paddingLeft: 20,
        width: '100%',
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <AnimatePresence mode="wait">
          {activeTab === 'console' && (
            <motion.div
              key="console"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <h4 style={{ color: '#c9d1d9', margin: 0, fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                Console Logs
              </h4>
              <div
                ref={logsContainerRef}
                style={{
                  width: '100%',
                  flex: '1 1 0',
                  minHeight: 0,
                  paddingTop: 16,
                  paddingRight: 16,
                  paddingBottom: 16,
                  paddingLeft: 16,
                  borderRadius: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  border: '1px solid #30363d',
                  overflowY: 'auto',
                  backgroundColor: '#0d1117',
                }}
              >
                {logs.length === 0 && !isExporting ? (
                  <div style={{ color: '#7d8590', fontStyle: 'italic' }}>
                    <span style={{ color: '#7d8590' }}>$</span> Ready to scrape. Click &quot;Scrape Discord Messages&quot; to start...
                  </div>
                ) : logs.length === 0 && isExporting ? (
                  <div style={{ color: '#f78166' }}>
                    <span style={{ color: '#7d8590' }}>[INFO]</span> <span style={{ color: '#ffa657' }}>🔄</span> Initializing export...
                  </div>
                ) : (
                  logs.map((log, index) => {
                    const style = getLogStyle(log);
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.02 }}
                        style={{ marginBottom: '4px', fontWeight: 400 }}
                      >
                        <span style={{ color: style.prefixColor, fontWeight: 700 }}>{style.prefix}</span>
                        <span style={{ color: style.color, marginLeft: 8 }}>
                          {log.replace(/^\[[^\]]*\]\s*/, '')}
                        </span>
                      </motion.div>
                    );
                  })
                )}
                {isExporting && (
                  <motion.div
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ color: '#f78166', marginTop: 8, fontWeight: 600 }}
                  >
                    <span style={{ color: '#f78166' }}>[INFO]</span> Export in progress...
                  </motion.div>
                )}
              </div>

              <AnimatePresence>
                {showScrollButton && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={scrollToBottom}
                    whileHover={{ scale: 1.05, backgroundColor: '#21262d' }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      position: 'absolute',
                      bottom: 28,
                      right: 28,
                      backgroundColor: '#30363d',
                      color: '#c9d1d9',
                      border: '1px solid #21262d',
                      borderRadius: 20,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      zIndex: 10,
                    }}
                  >
                    ↓ Trail Logs
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'content' && (
            <motion.div
              key="content"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              style={{ width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                flexShrink: 0,
              }}>
                <div>
                  <h4 style={{ color: '#c9d1d9', margin: 0, fontSize: 14, fontWeight: 600 }}>Scraped Content</h4>
                  {scrapedText.trim() && (
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                      {scrapedText.split('\n').filter(line => line.trim()).length} lines • {scrapedText.length} characters
                    </div>
                  )}
                </div>
                {(scrapedText.trim() || downloadId) && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <motion.button
                      onClick={copyToClipboard}
                      disabled={!scrapedText.trim()}
                      whileHover={scrapedText.trim() ? { scale: 1.03 } : {}}
                      whileTap={scrapedText.trim() ? { scale: 0.97 } : {}}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: copyState === 'success' ? 'rgba(87, 242, 135, 0.2)' : '#21262d',
                        border: `1px solid ${copyState === 'success' ? '#57f287' : '#30363d'}`,
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: scrapedText.trim() ? 'pointer' : 'not-allowed',
                        minWidth: 90,
                        color: copyState === 'success' ? '#57f287' : copyState === 'error' ? '#ed4245' : '#c9d1d9',
                        opacity: !scrapedText.trim() ? 0.6 : 1,
                      }}
                    >
                      {copyState === 'copying' ? 'Copying...' : copyState === 'success' ? '✓ Copied!' : copyState === 'error' ? 'Failed' : 'Copy'}
                    </motion.button>
                    <motion.button
                      onClick={downloadAsFile}
                      disabled={!downloadId}
                      whileHover={downloadId ? { scale: 1.03 } : {}}
                      whileTap={downloadId ? { scale: 0.97 } : {}}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: downloadState === 'success' ? 'rgba(87, 242, 135, 0.2)' : '#21262d',
                        border: `1px solid ${downloadState === 'success' ? '#57f287' : '#30363d'}`,
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: downloadId ? 'pointer' : 'not-allowed',
                        minWidth: 100,
                        color: downloadState === 'success' ? '#57f287' : downloadState === 'error' ? '#ed4245' : '#c9d1d9',
                        opacity: !downloadId ? 0.6 : 1,
                      }}
                    >
                      {downloadState === 'downloading' ? 'Downloading...' : downloadState === 'success' ? '✓ Downloaded!' : downloadState === 'error' ? 'Failed' : 'Download'}
                    </motion.button>
                  </div>
                )}
              </div>

              {!scrapedText.trim() ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    color: '#8b949e',
                    textAlign: 'center',
                    padding: '48px 24px',
                  }}
                >
                  {isExporting ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        style={{
                          width: 40,
                          height: 40,
                          border: '3px solid #30363d',
                          borderTopColor: '#5865f2',
                          borderRadius: '50%',
                          margin: '0 auto 16px',
                        }}
                      />
                      Scraping messages from Discord...
                      <br />
                      <small style={{ marginTop: 12, display: 'block', color: '#7d8590' }}>
                        Content will appear here as messages are fetched.
                      </small>
                    </>
                  ) : (
                    <>
                      No content scraped yet.
                      <br />
                      <small style={{ marginTop: 12, display: 'block', color: '#7d8590' }}>
                        Start scraping to see content here.
                      </small>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    width: '100%',
                    flex: '1 1 0',
                    minHeight: 0,
                    backgroundColor: '#0d1117',
                    paddingTop: 16,
                    paddingRight: 16,
                    paddingBottom: 16,
                    paddingLeft: 16,
                    borderRadius: 8,
                    border: '1px solid #30363d',
                    overflowY: 'auto',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: '#c9d1d9',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {scrapedText}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
