'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ExportResults from './export-results';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
};

export default function DiscordExportButton() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [maxMessagesText, setMaxMessagesText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [scrapedText, setScrapedText] = useState<string>('');
  const [downloadId, setDownloadId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'connected':
        break;
      case 'log':
        addLog(data.message);
        break;
      case 'progress':
        addLog(`Progress: Set ${data.data.set}, Messages: ${data.data.messagesFound}, Total: ${data.data.totalMessages}`);
        if (data.data.newContent && data.data.newContent.length > 0) {
          setScrapedText(prev => prev + data.data.newContent.join('\n') + '\n');
        }
        break;
      case 'complete':
        addLog('Export completed successfully!');
        setExportResult(data.data);
        setDownloadId(data.data.downloadId || '');
        setIsExporting(false);
        break;
      case 'error':
        addLog(`Error: ${data.message}`);
        setError(data.message);
        setIsExporting(false);
        break;
      default:
        break;
    }
  }, [addLog]);

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          console.log('WebSocket connected successfully');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        };

        ws.onclose = () => {
          setIsConnected(false);
          setTimeout(() => {
            if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
              connectWebSocket();
            }
          }, 3000);
        };

        ws.onerror = () => {
          addLog(`WebSocket error - check backend at ${wsUrl}`);
          setError('Connection error - make sure the backend is running');
        };
      } catch {
        addLog('Failed to connect to WebSocket server');
        setError('Failed to connect to server');
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [handleWebSocketMessage, addLog]);

  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      addLog('Export cancelled by user');
      setIsExporting(false);
      setError('Export was cancelled');
    }
  };

  const handleExport = async () => {
    if (!channelId.trim() || !discordToken.trim()) {
      setError('Please enter both Channel ID and Discord Token');
      addLog('Error: Missing Channel ID or Discord Token');
      return;
    }

    if (!isConnected || !wsRef.current) {
      setError('Not connected to server. Please wait for connection or restart the backend.');
      addLog('Error: Not connected to WebSocket server');
      return;
    }

    setIsExporting(true);
    setError(null);
    setExportResult(null);
    setMessages([]);
    setScrapedText('');
    setDownloadId('');
    setLogs([]);

    try {
      addLog('Starting Discord export...');
      const exportMessage = {
        action: 'export',
        channelId: channelId.trim(),
        discordToken: discordToken.trim(),
        maxMessages: (() => {
          const n = parseInt((maxMessagesText || '').trim(), 10);
          return Number.isFinite(n) && n > 0 ? n : 0;
        })()
      };
      wsRef.current.send(JSON.stringify(exportMessage));
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
      setError(err.message);
      setIsExporting(false);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
    setMessages([]);
    setScrapedText('');
    setDownloadId('');
    setExportResult(null);
    setError(null);
  };

  const canExport = isConnected && !isExporting;
  const isDisabled = !isConnected && !isExporting;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        width: '100%',
        height: 'calc(100vh - 48px)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'row',
        gap: 24,
      }}
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          width: 460,
          height: '100%',
          padding: 24,
          border: '1px solid rgba(48, 54, 61, 0.8)',
          borderRadius: '12px',
          backgroundColor: 'rgba(13, 17, 23, 0.9)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(88, 101, 242, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <motion.h3
          variants={itemVariants}
          style={{
            color: '#c9d1d9',
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
          }}
        >
          Discord Channel Exporter
        </motion.h3>

        <motion.div
          variants={itemVariants}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ color: '#8b949e', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            Backend:{' '}
            <code style={{
              background: '#161b22',
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #21262d',
            }}>
              {process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'}
            </code>
          </div>
          <motion.div
            animate={{
              scale: isConnected ? [1, 1.02, 1] : 1,
              boxShadow: isConnected
                ? ['0 0 0 0 rgba(87, 242, 135, 0)', '0 0 12px 2px rgba(87, 242, 135, 0.3)', '0 0 0 0 rgba(87, 242, 135, 0)']
                : 0,
            }}
            transition={{ duration: 1.5, repeat: isConnected ? Infinity : 0, repeatDelay: 2 }}
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              fontSize: '12px',
              fontWeight: 700,
              background: isConnected ? 'rgba(87, 242, 135, 0.15)' : 'rgba(237, 66, 69, 0.15)',
              color: isConnected ? '#57f287' : '#ed4245',
              border: `1px solid ${isConnected ? 'rgba(87, 242, 135, 0.4)' : 'rgba(237, 66, 69, 0.4)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <motion.span
              animate={isConnected ? { opacity: [1, 0.5, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
            >
              ●
            </motion.span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </motion.div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{
              color: '#c9d1d9',
              fontSize: '13px',
              fontWeight: 600,
            }}>
              Channel ID
            </label>
            <motion.input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="Right-click channel → Copy ID"
              disabled={isExporting}
              whileFocus={{ scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: isExporting ? '#161b22' : '#21262d',
                border: '1px solid #30363d',
                borderRadius: 8,
                color: isExporting ? '#8b949e' : '#c9d1d9',
                fontSize: '14px',
                fontFamily: 'var(--font-mono)',
                cursor: isExporting ? 'not-allowed' : 'text',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{
              color: '#c9d1d9',
              fontSize: '13px',
              fontWeight: 600,
            }}>
              Max messages
            </label>
            <motion.input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={maxMessagesText}
              onChange={(e) => setMaxMessagesText(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="All Messages"
              disabled={isExporting}
              whileFocus={{ scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: isExporting ? '#161b22' : '#21262d',
                border: '1px solid #30363d',
                borderRadius: 8,
                color: isExporting ? '#8b949e' : '#c9d1d9',
                fontSize: '14px',
                fontFamily: 'var(--font-mono)',
                cursor: isExporting ? 'not-allowed' : 'text',
                outline: 'none',
              }}
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{
            color: '#c9d1d9',
            fontSize: '13px',
            fontWeight: 600,
          }}>
            Discord Token
          </label>
          <motion.textarea
            value={discordToken}
            onChange={(e) => setDiscordToken(e.target.value)}
            placeholder="your_discord_token_here"
            rows={3}
            disabled={isExporting}
            whileFocus={{ scale: 1.005 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: isExporting ? '#161b22' : '#21262d',
              border: '1px solid #30363d',
              borderRadius: 8,
              color: isExporting ? '#8b949e' : '#c9d1d9',
              fontSize: '14px',
              fontFamily: 'var(--font-mono)',
              resize: 'vertical',
              cursor: isExporting ? 'not-allowed' : 'text',
              outline: 'none',
            }}
          />
          <small style={{ color: '#8b949e', fontSize: '11px', lineHeight: 1.4 }}>
            Use your Discord user token (DevTools → Network (Fetch/XHR) → Authorization). We don&apos;t save it. Use an alt account. NEVER SHARE YOUR TOKEN.
          </small>
        </motion.div>

        <motion.div
          variants={itemVariants}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}
        >
          <motion.button
            onClick={isExporting ? handleStop : handleExport}
            disabled={isDisabled}
            whileHover={canExport || isExporting ? { scale: 1.02 } : {}}
            whileTap={canExport || isExporting ? { scale: 0.98 } : {}}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{
              padding: '12px 24px',
              backgroundColor: isExporting ? '#ed4245' : (isDisabled ? '#6c757d' : '#5865f2'),
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              opacity: isDisabled ? 0.6 : 1,
              boxShadow: canExport ? '0 4px 14px rgba(88, 101, 242, 0.4)' : 'none',
            }}
          >
            {isExporting ? 'Stop Scraping' : (isDisabled ? 'Waiting for backend…' : 'Scrape Discord Messages')}
          </motion.button>

          <AnimatePresence>
            {(logs.length > 0 || messages.length > 0) && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={handleClearLogs}
                disabled={isExporting}
                whileHover={!isExporting ? { scale: 1.02, backgroundColor: '#30363d' } : {}}
                whileTap={!isExporting ? { scale: 0.98 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#21262d',
                  color: '#c9d1d9',
                  border: '1px solid #30363d',
                  borderRadius: 8,
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Clear Results
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                color: '#ff6b6b',
                fontSize: '14px',
                marginBottom: '10px',
                paddingTop: 12,
                paddingRight: 16,
                paddingBottom: 12,
                paddingLeft: 16,
                backgroundColor: 'rgba(237, 66, 69, 0.1)',
                borderRadius: 8,
                border: '1px solid rgba(237, 66, 69, 0.3)',
              }}
            >
              ❌ {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div style={{ width: 668, height: '100%', overflow: 'hidden' }}>
        <ExportResults
        messages={messages}
        logs={logs}
        scrapedText={scrapedText}
        downloadId={downloadId}
        isExporting={isExporting}
      />
      </motion.div>
    </motion.div>
  );
}
